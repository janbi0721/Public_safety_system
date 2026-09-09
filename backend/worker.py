import threading
import time


class YoloWorker(threading.Thread):

    def __init__(
        self,
        camera,
        detector,
        state,
        camera_id="camera-01"
    ):
        super().__init__(daemon=True)

        self.camera = camera
        self.detector = detector
        self.state = state
        self.camera_id = camera_id

        self.stop_event = threading.Event()

    def run(self):

        print(f"YOLO worker started: {self.camera_id}")

        while not self.stop_event.is_set():

            frame = self.camera.read()

            if frame is None:
                time.sleep(0.1)
                continue

            # YOLO 辨識
            result = self.detector.detect(frame)

            result["cameraId"] = self.camera_id

            # 只更新即時辨識資料
            self.state.update(result)

            # 注意：
            # 現在這裡不要 save_event()

    def stop(self):

        self.stop_event.set()

        self.camera.release()