import threading
from copy import deepcopy


class DetectionState:

    def __init__(self):
        self.lock = threading.Lock()
        self.sequence = 0
        self.data = {
            "cameraId": None,
            "timestamp": None,
            "capturedAt": None,
            "frameId": None,
            "inferenceMs": None,
            "frame": None,
            "detections": [],
            "people": [],
            "alerts": [],
        }

    def update(self, data):
        with self.lock:
            self.sequence += 1
            self.data = data

    def get(self):
        with self.lock:
            return {
                "sequence": self.sequence,
                "data": deepcopy(self.data),
            }
