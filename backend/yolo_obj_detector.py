import time

from ultralytics import YOLO


class Detector:

    def __init__(
        self,
        model_path,
        confidence=0.5
    ):
        self.model = YOLO(model_path)
        self.confidence = confidence

    def detect(self, frame):

        result = self.model.predict(
            source=frame,
            conf=self.confidence,
            verbose=False
        )[0]

        height, width = result.orig_shape

        detections = []

        boxes = result.boxes

        if boxes is not None:

            # normalized bbox
            xyxyn = boxes.xyxyn.cpu().tolist()

            confidence_list = (
                boxes.conf.cpu().tolist()
            )

            class_list = (
                boxes.cls.cpu().tolist()
            )

            for bbox, confidence, class_id in zip(
                xyxyn,
                confidence_list,
                class_list
            ):

                class_id = int(class_id)

                x1, y1, x2, y2 = bbox

                detections.append({
                    "classId": class_id,

                    "className":
                        result.names[class_id],

                    "confidence":
                        round(confidence, 4),

                    "bbox": {
                        "x1": x1,
                        "y1": y1,
                        "x2": x2,
                        "y2": y2
                    }
                })

        return {

            "timestamp": time.time(),

            "frame": {
                "width": width,
                "height": height
            },

            "detections": detections
        }