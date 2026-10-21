"""Restricted .env editor for engineering role. Never expose raw secrets or file paths."""
from __future__ import annotations
import os
import re
import stat
import tempfile
from pathlib import Path
from threading import RLock
from dotenv import dotenv_values

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
_LOCK = RLock()
# No model upload, model path, admin password, arbitrary file reads or shell commands.
EDITABLE = {
    "CAMERA_ID": {"label": "攝影機 ID", "type": "text", "default": "camera-01"},
    "CAMERA_SOURCE": {"label": "攝影機來源", "type": "text", "default": "0"},
    "AI_STREAM_ENABLED": {"label": "AI 串流", "type": "bool", "default": "1"},
    "AI_PUBLISH_URL": {"label": "AI RTSP 發布位置", "type": "text", "default": "rtsp://127.0.0.1:8554/camera01_ai"},
    "PPE_CONFIDENCE": {"label": "PPE 辨識信心門檻", "type": "number", "default": "0.20"},
    "PPE_IMGSZ": {"label": "PPE 推論影像尺寸", "type": "number", "default": "640"},
    "AI_STREAM_FPS": {"label": "AI 串流 FPS", "type": "number", "default": "10"},
    "VIDEO_ENCODER": {"label": "影像編碼器", "type": "text", "default": "libx264"},
    "FFMPEG_PATH": {"label": "FFmpeg 路徑", "type": "text", "default": ""},
    "VITE_MEDIAMTX_STREAM": {"label": "前端原始串流名稱", "type": "text", "default": "camera01"},
    "VITE_CAMERA_ID": {"label": "前端攝影機 ID", "type": "text", "default": "camera-01"},
    "GEMINI_MODEL": {"label": "Gemini 模型", "type": "text", "default": "gemini-3.5-flash-lite"},
    "GEMINI_API_KEY": {"label": "Gemini API Key", "type": "secret", "default": ""},
}


def _contains_credentials(value: str) -> bool:
    return bool(re.match(r"(?i)^(?:rtsp|rtsps|http|https)://[^/\s]*@", value))


def list_environment() -> dict:
    with _LOCK:
        data = dotenv_values(ENV_PATH) if ENV_PATH.is_file() else {}
    fields = []
    for name, spec in EDITABLE.items():
        actual = data.get(name)
        value = spec["default"] if actual is None else str(actual)
        is_protected = spec["type"] == "secret" or _contains_credentials(value)
        fields.append({
            "name": name,
            "label": spec["label"],
            "type": "secret" if is_protected else spec["type"],
            "value": "" if is_protected else value,
            "configured": bool(value) if is_protected else None,
            "protected": is_protected,
        })
    return {"fields": fields, "restart_required": True}


def _validate(name: str, value: str) -> str:
    if name not in EDITABLE:
        raise ValueError("設定欄位不允許修改")
    if not isinstance(value, str):
        raise ValueError(f"{name} 必須為文字")
    if len(value) > 2048 or any(ch in value for ch in "\r\n\x00"):
        raise ValueError(f"{name} 包含無效字元")
    if "${" in value:
        raise ValueError("不接受環境變數插值")
    if name in ("CAMERA_ID", "VITE_CAMERA_ID") and not re.fullmatch(r"[a-zA-Z0-9_-]{1,48}", value):
        raise ValueError(f"{name} 只能是英文、數字、- 或 _")
    if name == "CAMERA_SOURCE" and not (re.fullmatch(r"\d{1,2}", value) or re.match(r"(?i)^rtsps?://[^\s]+$", value) or re.match(r"(?i)^https?://[^\s]+$", value)):
        raise ValueError("攝影機來源必須是裝置編號、RTSP 或 HTTP(S) URL")
    if name == "AI_PUBLISH_URL" and not re.fullmatch(r"(?i)rtsps?://[^\s]+", value):
        raise ValueError("AI 串流位址必須是 RTSP URL")
    if name == "AI_STREAM_ENABLED" and value not in ("0", "1"):
        raise ValueError("AI_STREAM_ENABLED 僅接受 0 或 1")
    if name == "PPE_CONFIDENCE":
        try:
            valid = 0 < float(value) <= 1
        except ValueError:
            valid = False
        if not valid:
            raise ValueError("PPE_CONFIDENCE 必須大於 0 且不超過 1")
    if name == "PPE_IMGSZ" and (not value.isdigit() or int(value) not in (320, 416, 512, 640, 768, 960, 1024, 1280)):
        raise ValueError("PPE_IMGSZ 請選擇 320、416、512、640、768、960、1024 或 1280")
    if name == "AI_STREAM_FPS" and not (value.isdigit() and 1 <= int(value) <= 30):
        raise ValueError("AI_STREAM_FPS 必須介於 1 到 30")
    if name == "VIDEO_ENCODER" and value not in ("libx264", "h264_nvenc"):
        raise ValueError("影像編碼器僅允許 libx264 或 h264_nvenc")
    if name == "VITE_MEDIAMTX_STREAM" and not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", value):
        raise ValueError("串流名稱僅能使用英數字、-、_")
    if name == "GEMINI_MODEL" and not re.fullmatch(r"[a-zA-Z0-9_.-]{1,100}", value):
        raise ValueError("Gemini 模型名稱格式不正確")
    if name == "GEMINI_API_KEY" and (not value or len(value) < 10):
        raise ValueError("金鑰長度不正確；留空代表不更新")
    return value


def _encode(value: str) -> str:
    # dotenv-friendly quoted values. The validator rejects newlines and interpolation.
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'


def save_environment(changes: dict[str, str]) -> list[str]:
    if not isinstance(changes, dict) or not changes or len(changes) > len(EDITABLE):
        raise ValueError("沒有有效的設定")
    sanitized = {name: _validate(name, value) for name, value in changes.items()}
    with _LOCK:
        ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
        original = ENV_PATH.read_text(encoding="utf-8-sig") if ENV_PATH.exists() else ""
        lines = original.splitlines(keepends=True)
        done = set()
        output = []
        for line in lines:
            match = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=", line)
            if match and match.group(1) in sanitized:
                name = match.group(1)
                if name not in done:
                    output.append(name + "=" + _encode(sanitized[name]) + "\n")
                    done.add(name)
                continue
            output.append(line)
        if output and not output[-1].endswith("\n"):
            output[-1] += "\n"
        for name, value in sanitized.items():
            if name not in done:
                output.append(name + "=" + _encode(value) + "\n")
        fd, candidate = tempfile.mkstemp(prefix=".env.", suffix=".tmp", dir=ENV_PATH.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as file:
                file.writelines(output)
                file.flush()
                os.fsync(file.fileno())
            mode = stat.S_IMODE(ENV_PATH.stat().st_mode) if ENV_PATH.exists() else 0o600
            os.chmod(candidate, mode)
            os.replace(candidate, ENV_PATH)
        finally:
            if os.path.exists(candidate):
                os.unlink(candidate)
    return sorted(sanitized)
