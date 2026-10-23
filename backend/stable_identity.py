"""Stable person numbers on top of the tracker's trackId.

BoT-SORT sometimes starts a fresh trackId when a person comes back after a
short absence (e.g. re-entering half-visible at the frame edge). This layer
keeps one number per person for a camera: when the tracker reports a new
trackId, it is matched against people who left within `window_seconds`
using clothing colour (helmet / vest / shirt), and the old number is reused.

The stable number replaces `trackId` on person detections, so analyzer,
events and person records all continue under the same number.
"""
import cv2
import numpy as np

# Minimum histogram correlation to reuse a lost person's number.
MATCH_SIMILARITY = 0.55
# Looser bar when exactly one person left and exactly one new person appeared.
SINGLE_CANDIDATE_SIMILARITY = 0.25
# The best candidate must beat the runner-up by this much when several left.
AMBIGUITY_MARGIN = 0.1
# Forget raw→stable mappings and lost people after this long.
FORGET_SECONDS = 600


def _appearance(frame, bbox):
    """HSV colour histogram of the upper 65% of the person box (helmet, vest, shirt)."""
    h, w = frame.shape[:2]
    x1 = max(0, int(bbox['x1'] * w)); x2 = min(w, int(bbox['x2'] * w))
    y1 = max(0, int(bbox['y1'] * h)); y2 = min(h, int(bbox['y1'] * h + (bbox['y2'] - bbox['y1']) * h * 0.65))
    if x2 - x1 < 8 or y2 - y1 < 8:
        return None
    hsv = cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [18, 8], [0, 180, 0, 256])
    return cv2.normalize(hist, hist).flatten()


def _similarity(a, b):
    if a is None or b is None:
        return 0.0
    return float(cv2.compareHist(a.astype(np.float32), b.astype(np.float32), cv2.HISTCMP_CORREL))


class StableIdentity:
    def __init__(self, window_seconds=30.0):
        self.window_seconds = window_seconds  # kept equal to EventManager.occlusion_seconds by the worker
        self.raw_to_stable = {}
        self.people = {}  # stable id -> {'last_seen', 'appearance', 'raw'}
        self.next_id = 1

    def reset(self):
        self.raw_to_stable.clear(); self.people.clear(); self.next_id = 1

    def _new_id(self):
        sid = self.next_id
        self.next_id += 1
        return sid

    def assign(self, detections, frame, t):
        persons = [d for d in detections if d.get('className', '').lower() == 'person' and d.get('trackId') is not None]
        known, fresh = [], []
        for d in persons:
            (known if d['trackId'] in self.raw_to_stable else fresh).append(d)
        owner = {}  # stable id -> detection holding it in this frame
        for d in known:
            sid = self.raw_to_stable[d['trackId']]
            other = owner.get(sid)
            if other is None:
                owner[sid] = d
                continue
            # Two raw IDs map to one number (the tracker reused an old raw ID for
            # someone else). Whoever carries the person's current raw ID keeps it;
            # the other one is treated as a newcomer. One number = one person per frame.
            keep, drop = (d, other) if self.people.get(sid, {}).get('raw') == d['trackId'] else (other, d)
            owner[sid] = keep
            del self.raw_to_stable[drop['trackId']]
            fresh.append(drop)
        visible = set(owner)
        # People who left recently and are not on screen now are relink candidates.
        lost = {sid: p for sid, p in self.people.items()
                if sid not in visible and 0 < t - p['last_seen'] <= self.window_seconds}
        looks = {id(d): _appearance(frame, d['bbox']) for d in fresh}
        for d in fresh:
            scores = sorted(((_similarity(looks[id(d)], p['appearance']), sid) for sid, p in lost.items()), reverse=True)
            sid = None
            if scores:
                best, best_sid = scores[0]
                single = len(lost) == 1 and len(fresh) == 1
                if single and best >= SINGLE_CANDIDATE_SIMILARITY:
                    sid = best_sid
                elif best >= MATCH_SIMILARITY and (len(scores) == 1 or best - scores[1][0] >= AMBIGUITY_MARGIN):
                    sid = best_sid
            if sid is None:
                sid = self._new_id()
            else:
                lost.pop(sid, None)
                # The old raw ID now belongs to nobody; if the tracker reuses it later
                # for someone else, it must not bring this number along.
                for raw in [r for r, s in self.raw_to_stable.items() if s == sid]:
                    del self.raw_to_stable[raw]
            self.raw_to_stable[d['trackId']] = sid
            visible.add(sid)
        for d in persons:
            sid = self.raw_to_stable[d['trackId']]
            look = looks.get(id(d)) if d in fresh else _appearance(frame, d['bbox'])
            person = self.people.setdefault(sid, {'appearance': look, 'last_seen': t, 'raw': d['trackId']})
            if look is not None:
                # Slowly blend so one odd frame (turning, partial view) cannot overwrite the look.
                person['appearance'] = look if person['appearance'] is None else 0.8 * person['appearance'] + 0.2 * look
            person['last_seen'] = t
            person['raw'] = d['trackId']
            d['rawTrackId'] = d['trackId']
            d['trackId'] = sid
        for sid in [s for s, p in self.people.items() if t - p['last_seen'] > FORGET_SECONDS]:
            del self.people[sid]
        live_raw = {p['raw'] for p in self.people.values()}
        for raw in [r for r in self.raw_to_stable if r not in live_raw and self.raw_to_stable[r] not in self.people]:
            del self.raw_to_stable[raw]
        return detections
