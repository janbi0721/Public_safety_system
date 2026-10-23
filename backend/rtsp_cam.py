from __future__ import annotations

import threading
import time

import cv2


class Camera:
    """Low-latency camera reader that always keeps the newest frame."""

    def __init__(self, source=0, width=1280, height=720, fps=30):
        self.source = source
        self.width = width
        self.height = height
        self.fps = fps

        self.cam = None
        self.frame = None
        self.frame_id = 0
        self.captured_at = None

        self.lock = threading.Lock()
        self.running = True

        # Opening happens in the capture thread: an unreachable RTSP source can
        # take ~30 s to time out and must not block whoever creates the Camera.
        self.thread = threading.Thread(
            target=self._capture_loop,
            name="CameraCapture",
            daemon=True,
        )
        self.thread.start()

    def _open(self):
        if self.cam is not None:
            self.cam.release()

        if isinstance(self.source, str):
            cam = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
        else:
            # DirectShow generally gives lower webcam latency on Windows.
            cam = cv2.VideoCapture(self.source, cv2.CAP_DSHOW)
            if not cam.isOpened():
                cam.release()
                cam = cv2.VideoCapture(self.source)

        cam.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        cam.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        cam.set(cv2.CAP_PROP_FPS, self.fps)
        if not isinstance(self.source, str):
            # Webcams default to uncompressed YUY2, which USB limits to ~10 fps at 720p.
            # MJPG gives more frames; it must be set after the size and fps to take effect.
            cam.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        cam.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        if not self.running:  # released while we were still connecting
            cam.release()
            return
        self.cam = cam

    def _capture_loop(self):
        self._open()
        while self.running:
            if self.cam is None or not self.cam.isOpened():
                time.sleep(0.5)
                self._open()
                continue

            ret, frame = self.cam.read()
            if not ret:
                print("攝影機讀取失敗，正在重新連線…")
                time.sleep(0.5)
                self._open()
                continue

            with self.lock:
                self.frame = frame
                self.frame_id += 1
                self.captured_at = time.time()

    def read(self):
        with self.lock:
            if self.frame is None:
                return None
            return self.frame.copy()

    def read_with_meta(self):
        with self.lock:
            if self.frame is None:
                return None, None, None
            return self.frame.copy(), self.frame_id, self.captured_at

    def meta(self):
        """Frame id and capture time without copying the frame (cheap health check)."""
        with self.lock:
            return self.frame_id, self.captured_at

    def release(self):
        self.running = False
        if hasattr(self, "thread") and self.thread.is_alive():
            self.thread.join(timeout=1)
        if self.cam is not None:
            self.cam.release()
