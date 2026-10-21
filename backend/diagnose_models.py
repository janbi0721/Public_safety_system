"""Run both detectors on an image or a locally attached camera.

Examples (from the backend directory):
    python diagnose_models.py --source 0 --frames 20
    python diagnose_models.py --source ./my_photo.jpg --ppe-confidence 0.10

Outputs a local debug_annotated.jpg and console detections. It does NOT
send images anywhere. Use a frame showing helmet, respirator, and gloves.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
from snapshot_service import draw
from yolo_obj_detector import Detector


def load_frame(source: str, frames: int):
    path = Path(source)
    if path.is_file() and path.suffix.lower() in {'.jpg','.jpeg','.png','.bmp','.webp'}:
        frame = cv2.imread(str(path))
        if frame is None:
            raise RuntimeError(f'Could not read image: {source}')
        return frame

    capture = cv2.VideoCapture(int(source) if source.isdecimal() else source)
    if not capture.isOpened():
        capture.release()
        raise RuntimeError(f'Could not open camera/video: {source}')
    result = None
    try:
        for _ in range(frames):
            ok, frame = capture.read()
            if ok:
                result = frame
    finally:
        capture.release()
    if result is None:
        raise RuntimeError('Camera opened, but did not supply any frames')
    return result


def main():
    parser = argparse.ArgumentParser(description='Dual YOLO camera/frame debugger')
    parser.add_argument('--source',default='0',help='Camera index, image file or RTSP URL')
    parser.add_argument('--frames',type=int,default=20,help='Frames to read before inference')
    parser.add_argument('--ppe-confidence',type=float,default=.20)
    parser.add_argument('--ppe-imgsz',type=int,default=640)
    parser.add_argument('--output',type=Path,default=Path('debug_annotated.jpg'))
    args = parser.parse_args()
    if args.frames<1:parser.error('--frames must be >= 1')
    here=Path(__file__).resolve().parent
    detector=Detector(here/'model'/'best.pt',here/'model'/'yolo11n.pt',
                      confidence=.5,ppe_confidence=args.ppe_confidence,
                      ppe_imgsz=args.ppe_imgsz)
    frame=load_frame(args.source,args.frames)
    result=detector.detect(frame)
    print('Raw detections (after confidence filtering):')
    for item in result['detections']:
        print(f"  {item['className']:20s} conf={item['confidence']:.3f} "
              f"xyxy={tuple(round(v,3) for v in item['bbox'].values())}")
    print('Model detection counts:',result['modelDetections'])
    args.output.parent.mkdir(parents=True,exist_ok=True)
    if not cv2.imwrite(str(args.output),draw(frame,result['detections'])):
        raise RuntimeError('Could not save debug image')
    print('Annotated debug image:',args.output.resolve())
    if result['modelDetections']['ppe']==0:
        print('No PPE boxes from best.pt at this threshold. Test a lower '
              '--ppe-confidence and/or --ppe-imgsz 960; review your model/data.')


if __name__=='__main__':
    main()
