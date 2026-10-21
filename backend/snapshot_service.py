"""Immutable event evidence, no public unauthenticated file endpoint."""
import os
import re
import zlib
from pathlib import Path
import cv2
from v2_data import add_snapshot

ROOT=Path(__file__).resolve().parent/'snapshots'

# Box colours as '#RRGGBB', keyed by the model's raw class name. VIOLATION_KEY
# is the colour of a person currently in violation. Engineers override these
# via system_settings['box_colors']; see set_box_colors().
VIOLATION_KEY = '__violation__'
DEFAULT_BOX_COLORS = {
    'person': '#4196FF',             # blue
    VIOLATION_KEY: '#EB3223',        # red
    'helmet': '#60C448',             # green
    'gas_mask': '#FFBE1E',           # yellow
    'respirator': '#FFBE1E',
    'gloves': '#D750C8',             # magenta
    'aluminized_gloves': '#D750C8',
}
# Classes without a default get a stable colour from this list.
FALLBACK_COLORS = ['#00BCD4', '#FF7043', '#9CCC65', '#7E57C2', '#26A69A', '#8D6E63']
HEX_COLOR = re.compile(r'^#[0-9A-Fa-f]{6}$')

_overrides = {}

def default_color(name):
    key = str(name).strip().lower()
    if key in DEFAULT_BOX_COLORS:
        return DEFAULT_BOX_COLORS[key]
    return FALLBACK_COLORS[zlib.crc32(key.encode()) % len(FALLBACK_COLORS)]

def color_hex(name):
    key = str(name).strip().lower()
    return _overrides.get(key) or default_color(key)

def set_box_colors(colors):
    """Replace engineer overrides; invalid entries are ignored."""
    global _overrides
    _overrides = {str(k).strip().lower(): v.upper() for k, v in (colors or {}).items()
                  if isinstance(v, str) and HEX_COLOR.match(v)}

def _bgr(hex_color):
    return int(hex_color[5:7], 16), int(hex_color[3:5], 16), int(hex_color[1:3], 16)

def _text_bgr(bgr):
    luminance = 0.114 * bgr[0] + 0.587 * bgr[1] + 0.299 * bgr[2]
    return (10, 10, 10) if luminance > 140 else (245, 245, 245)

def draw(frame, detections, alerts=None):
    """Draw merged person + PPE detections on one camera frame (BGR).

    PPE labels keep the checkpoint's original class names, e.g. ``gloves``
    or ``aluminized_gloves``. Clip coordinates/labels to the visible image.
    """
    out = frame.copy()
    height, width = out.shape[:2]
    violating = {a.get('trackId') for a in (alerts or [])}
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
        color = _bgr(color_hex(VIOLATION_KEY if key == 'person' and d.get('trackId') in violating else key))
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
                    scale, _text_bgr(color), 1, cv2.LINE_AA)
    return out

def capture(event_id,phase,raw,annotated,frame_id,captured_at):
    ROOT.mkdir(parents=True,exist_ok=True)
    for name,frame in [('raw',raw),('annotated',annotated)]:
        if frame is None:continue
        filename=f'event_{event_id}_{phase}_{name}.jpg'
        path=ROOT/filename
        if cv2.imwrite(str(path),frame,[cv2.IMWRITE_JPEG_QUALITY,92]):
            add_snapshot(event_id,phase,name,filename,frame_id,captured_at)
