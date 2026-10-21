import logging,threading,time
from event_manager import EventManager
from person_recorder import PersonRecorder
from safety_analyzer import SafetyAnalyzer
from snapshot_service import capture,draw
from video_pipeline import VideoPublisher

class YoloWorker(threading.Thread):
    def __init__(self,camera,detector,state,camera_id='camera-01',required_ppe=None,event_trigger_seconds=1.5,pose=None,publish_url=None):
        super().__init__(daemon=True)
        self.camera=camera;self.detector=detector;self.state=state;self.camera_id=camera_id
        self.pose=pose;self.analyzer=SafetyAnalyzer(required_ppe=required_ppe,supported_classes=detector.ppe_names.values())
        self.publisher=VideoPublisher(url=publish_url);self.stop_event=threading.Event();self.error=None
        self._latest_raw=None;self._latest_annotated=None;self._last_frame_id=None;self._last_violation_frames={}
        self._image_lock=threading.Lock();self._last_fps_at=time.monotonic();self._frames=0;self.fps=0
        self.event_manager=EventManager(camera_id,trigger_seconds=event_trigger_seconds,on_transition=self._transition)
        self.person_recorder=PersonRecorder(camera_id,self.event_manager)
        self.event_manager.person_recorder=self.person_recorder
    def _transition(self,phase,event_id,ts,violation):
        with self._image_lock:
            raw=self._latest_raw.copy() if self._latest_raw is not None else None
            annotated=self._latest_annotated.copy() if self._latest_annotated is not None else None
            fid=self._last_frame_id
        key=(violation.get('trackId'),violation.get('eventType'))
        if phase=='end':
            from database import get_event
            ev=get_event(event_id)
            if ev and ev.get('close_reason')!='recovered' and key in self._last_violation_frames:
                raw,annotated,fid=self._last_violation_frames[key]
            self._last_violation_frames.pop(key,None)
        capture(event_id,phase,raw,annotated,fid,ts)
    def latest_jpeg(self):
        import cv2
        with self._image_lock:
            if self._latest_annotated is None:return None,self._last_frame_id
            ok,encoded=cv2.imencode('.jpg',self._latest_annotated,[cv2.IMWRITE_JPEG_QUALITY,82])
            return (encoded.tobytes() if ok else None),self._last_frame_id
    def run(self):
        last=None
        while not self.stop_event.is_set():
            frame,fid,at=self.camera.read_with_meta()
            if frame is None or fid==last:time.sleep(.02);continue
            last=fid
            try:
                result=self.detector.detect(frame,frame_id=fid,captured_at=at)
                poses=self.pose.detect(frame) if self.pose else []
                analysis=self.analyzer.analyze(result['detections'],poses)
                result['people']=analysis['people'];result['cameraId']=self.camera_id
                annotated=draw(frame,result['detections'],analysis['violations'])
                with self._image_lock:
                    self._latest_raw=frame.copy();self._latest_annotated=annotated.copy();self._last_frame_id=fid
                for v in analysis['violations']:
                    if v.get('trackId') is not None:
                        k=(v['trackId'],v['eventType'])
                        self._last_violation_frames[k]=(frame.copy(),annotated.copy(),fid)
                if len(self._last_violation_frames)>100:
                    self._last_violation_frames.pop(next(iter(self._last_violation_frames)))
                # Record people first so a new event can be linked to its person session.
                try:self.person_recorder.process(analysis['people'],result['timestamp'])
                except Exception:logging.exception('Person record update failed')
                result['alerts']=self.event_manager.process(analysis['violations'],result['timestamp'],analysis['people'])
                self.publisher.publish(annotated)
                self._frames+=1
                elapsed=time.monotonic()-self._last_fps_at
                if elapsed>=2:self.fps=round(self._frames/elapsed,1);self._frames=0;self._last_fps_at=time.monotonic()
                result['aiFps']=self.fps;result['status']='online';self.error=None
                self.state.update(result)
            except Exception as e:
                self.error=str(e);logging.exception('YOLO Worker frame failed');time.sleep(.2)
        self.person_recorder.close_all('system_stopped')
        self.publisher.close()
    def stop(self):
        self.stop_event.set();self.camera.release()
