"""Immutable event evidence, no public unauthenticated file endpoint."""
import os
from pathlib import Path
import cv2
from v2_data import add_snapshot

ROOT=Path(__file__).resolve().parent/'snapshots'

def draw(frame, detections, alerts=None):
    """Draw merged person + PPE detections on one camera frame (BGR).

    PPE labels keep the checkpoint's original class names, including
    ``aluminized_gloves``. Clip coordinates/labels to the visible image.
    """
    out = frame.copy()
    height, width = out.shape[:2]
    violating = {a.get('trackId') for a in (alerts or [])}
    palette = {
        'person': (255, 150, 65),       # blue
        'helmet': (72, 196, 96),        # green
        'respirator': (30, 190, 255),   # yellow
        'aluminized_gloves': (200, 80, 215),  # magenta
    }
    for d in detections:
        bbox = d['bbox']
        x1 = max(0, min(width - 1, round(bbox['x1'] * width)))
        y1 = max(0, min(height - 1, round(bbox['y1'] * height)))
        x2 = max(0, min(width - 1, round(bbox['x2'] * width)))
        y2 = max(0, min(height - 1, round(bbox['y2'] * height)))
        if x2 <= x1 or y2 <= y1:
            continue
        name = d['className']
        key = str(name).strip().lower()
        color = (35, 50, 235) if key == 'person' and d.get('trackId') in violating else palette.get(key, (72, 196, 96))
        cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
        title = f"{name} {d.get('confidence', 0):.2f}"
        if d.get('trackId') is not None:
            title += f" #{d['trackId']}"
        scale = 0.5
        (tw, th), baseline = cv2.getTextSize(title, cv2.FONT_HERSHEY_SIMPLEX, scale, 1)
        tx = max(0, min(x1, width - tw - 3))
        ty = (y1 - 5) if y1 - th - 5 >= 0 else min(height - baseline - 1, y1 + th + 5)
        ty = max(th + 1, ty)
        cv2.rectangle(out, (tx, max(0, ty-th-3)),
                      (min(width-1, tx+tw+2), min(height-1, ty+baseline)), color, -1)
        cv2.putText(out, title, (tx+1, ty), cv2.FONT_HERSHEY_SIMPLEX,
                    scale, (10, 10, 10), 1, cv2.LINE_AA)
    return out

def capture(event_id,phase,raw,annotated,frame_id,captured_at):
    ROOT.mkdir(parents=True,exist_ok=True)
    for name,frame in [('raw',raw),('annotated',annotated)]:
        if frame is None:continue
        filename=f'event_{event_id}_{phase}_{name}.jpg'
        path=ROOT/filename
        if cv2.imwrite(str(path),frame,[cv2.IMWRITE_JPEG_QUALITY,92]):
            add_snapshot(event_id,phase,name,filename,frame_id,captured_at)
