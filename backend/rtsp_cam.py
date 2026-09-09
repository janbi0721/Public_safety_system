import cv2
import time


class Camera:
    def __init__(self, source):
        self.source = source
        self.cam = None

        self._open()

    def _open(self):
        if self.cam is not None:
            self.cam.release()

        # RTSP
        if isinstance(self.source, str):
            self.cam = cv2.VideoCapture(
                self.source,
                cv2.CAP_FFMPEG
            )

            self.cam.set(
                cv2.CAP_PROP_BUFFERSIZE,
                1
            )

        # Webcam
        else:
            self.cam = cv2.VideoCapture(
                self.source
            )

    def read(self):
        ret, frame = self.cam.read()

        if not ret:
            print("攝影機讀取失敗，正在重新連線…")

            time.sleep(1)
            self._open()

            return None

        return frame

    def release(self):
        if self.cam is not None:
            self.cam.release()