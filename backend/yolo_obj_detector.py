from __future__ import annotations

import time
from pathlib import Path

from ultralytics import YOLO

# BoT-SORT + appearance ReID so a briefly hidden person keeps the same trackId.
PERSON_TRACKER = str(Path(__file__).resolve().parent / "trackers" / "person_botsort.yaml")

class Detector:
    """Merge COCO-person tracks and PPE detections on the *same* BGR frame.

    The public ``className`` is always the original model label (including
    ``aluminized_gloves``); ``SafetyAnalyzer`` maps aliases for compliance.
    PPE uses its own lower confidence cutoff so small protective items are
    not silently filtered by the person threshold.
    """

    def __init__(
        self,
        ppe_model_path,
        person_model_path=None,
        confidence=0.5,
        imgsz=640,
        ppe_confidence=0.20,
        ppe_imgsz=None,
    ):
        self.ppe_model_path = str(Path(ppe_model_path))
        self.person_model_path = str(Path(person_model_path)) if person_model_path else None
        self.confidence = float(confidence)  # person / single-model cutoff
        self.imgsz = int(imgsz)
        self.ppe_confidence = float(ppe_confidence)
        self.ppe_imgsz = int(ppe_imgsz) if ppe_imgsz is not None else self.imgsz
        if not (0 < self.confidence <= 1 and 0 < self.ppe_confidence <= 1):
            raise ValueError("Model confidence thresholds must be between 0 and 1")
        if self.imgsz <= 0 or self.ppe_imgsz <= 0:
            raise ValueError("Model image sizes must be positive")

        self.ppe_model = YOLO(self.ppe_model_path)
        self.ppe_names = self._names(self.ppe_model.names)
        self.ppe_has_person = any(name.casefold() == "person" for name in self.ppe_names.values())

        self.person_model = None
        self.person_class_id = None
        if not self.ppe_has_person:
            if not self.person_model_path:
                raise ValueError("PPE model has no 'person' class; person_model_path is required.")
            self.person_model = YOLO(self.person_model_path)
            person_ids = [cid for cid, name in self._names(self.person_model.names).items()
                          if name.casefold() == "person"]
            if not person_ids:
                raise ValueError("Person model does not contain a 'person' class")
            self.person_class_id = person_ids[0]

        self.model_version = Path(self.ppe_model_path).name
        print("PPE model:", self.ppe_model_path, "classes:", self.ppe_names)
        if self.person_model:
            print("Person model:", self.person_model_path,
                  "PPE confidence:", self.ppe_confidence,
                  "PPE imgsz:", self.ppe_imgsz)
        else:
            print("PPE model includes person; using single-model mode")

    @staticmethod
    def _names(names):
        if isinstance(names, dict):
            return {int(k): str(v) for k, v in names.items()}
        return {index: str(name) for index, name in enumerate(names)}

    def detect(self, frame, frame_id=None, captured_at=None):
        started = time.perf_counter()

        if self.ppe_has_person:
            result = self.ppe_model.track(
                source=frame, conf=self.ppe_confidence, imgsz=self.ppe_imgsz,
                persist=True, tracker=PERSON_TRACKER, verbose=False,
            )[0]
            detections = self._parse_result(result)
            person_count = sum(d["className"].casefold() == "person" for d in detections)
            ppe_count = len(detections) - person_count
        else:
            person_result = self.person_model.track(
                source=frame, classes=[self.person_class_id],
                conf=self.confidence, imgsz=self.imgsz, persist=True,
                tracker=PERSON_TRACKER, verbose=False,
            )[0]
            # Important: pass the ORIGINAL frame here, not person_result.plot()
            # and not a cropped/mutated frame. Both results use frame coordinates.
            ppe_result = self.ppe_model.predict(
                source=frame, conf=self.ppe_confidence,
                imgsz=self.ppe_imgsz, verbose=False,
            )[0]
            persons = [d for d in self._parse_result(person_result)
                       if d["className"].casefold() == "person"]
            ppe = [d for d in self._parse_result(ppe_result)
                   if d["className"].casefold() != "person"]
            detections = persons + ppe
            person_count, ppe_count = len(persons), len(ppe)
            result = person_result

        inference_ms = (time.perf_counter() - started) * 1000
        height, width = frame.shape[:2]
        return {
            "timestamp": time.time(),
            "capturedAt": captured_at,
            "frameId": frame_id,
            "inferenceMs": round(inference_ms, 2),
            "frame": {"width": width, "height": height},
            "modelDetections": {"person": person_count, "ppe": ppe_count},
            "detections": detections,
        }

    @staticmethod
    def _parse_result(result):
        boxes = result.boxes
        if boxes is None or len(boxes) == 0:
            return []
        xyxyn = boxes.xyxyn.cpu().tolist()
        confidences = boxes.conf.cpu().tolist()
        class_ids = boxes.cls.cpu().tolist()
        ids = (boxes.id.int().cpu().tolist() if boxes.id is not None
               else [None] * len(xyxyn))
        names = Detector._names(result.names)
        detections = []
        for bbox, confidence, class_id, track_id in zip(xyxyn, confidences, class_ids, ids):
            class_id = int(class_id)
            x1, y1, x2, y2 = (float(x) for x in bbox)
            detections.append({
                "trackId": track_id,
                "classId": class_id,
                "className": names.get(class_id, str(class_id)),
                "confidence": round(float(confidence), 4),
                "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
            })
        return detections
