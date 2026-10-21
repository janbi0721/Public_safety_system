"""Optional Ultralytics COCO-17 pose locator; never treat absent joints as noncompliance."""
class PoseDetector:
    def __init__(self,path=None,confidence=0.35):
        self.model=None
        if path:
            from ultralytics import YOLO
            self.model=YOLO(str(path))
        self.confidence=confidence
    def detect(self,frame):
        if self.model is None:return []
        results=self.model.predict(frame,conf=self.confidence,verbose=False)[0]
        if results.keypoints is None or results.boxes is None:return []
        boxes=results.boxes.xyxyn.cpu().tolist()
        points=results.keypoints.xyn.cpu().tolist()
        confidences=results.keypoints.conf
        conf=confidences.cpu().tolist() if confidences is not None else [[1]*17 for _ in boxes]
        return [{'bbox':dict(zip(('x1','y1','x2','y2'),box)), 'points': [{'x':p[0],'y':p[1],'confidence':c} for p,c in zip(k,confrow)]} for box,k,confrow in zip(boxes,points,conf)]
