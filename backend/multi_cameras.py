"""Runtime two-input camera controller; only healthy enabled inputs reach public listings."""
import os,threading,time,logging
from database import get_connection,get_cameras
from v2_data import get_settings
from rtsp_cam import Camera
from worker import YoloWorker
from state import DetectionState
from yolo_obj_detector import Detector

IDS=('camera-01','camera-02')

def initialize_sources():
    with get_connection() as db:
        db.execute("""CREATE TABLE IF NOT EXISTS camera_sources (
           camera_id TEXT PRIMARY KEY, source TEXT NOT NULL,
           FOREIGN KEY(camera_id) REFERENCES cameras(camera_id))""")
        db.execute("UPDATE cameras SET name='筆電攝影機',source_type='local' WHERE camera_id='camera-01' AND name='Camera 01'")
        db.execute("INSERT OR IGNORE INTO cameras(camera_id,name,location,source_type,is_active) VALUES('camera-02','RTSP 攝影機','', 'rtsp',0)")
        for camera_id,source in [('camera-01',os.getenv('CAMERA_SOURCE','0')),('camera-02',os.getenv('CAMERA_2_SOURCE',''))]:
            db.execute('INSERT OR IGNORE INTO camera_sources(camera_id,source) VALUES(?,?)',(camera_id,source))
        db.commit()

def all_camera_settings():
    with get_connection() as db:
        rows=db.execute("""SELECT c.camera_id,c.name,c.location,c.source_type,c.is_active,
          COALESCE(s.source,'') AS source FROM cameras c LEFT JOIN camera_sources s USING(camera_id)
          WHERE c.camera_id IN ('camera-01','camera-02') ORDER BY c.camera_id""").fetchall()
    return [dict(row) for row in rows]

class CameraManager:
    """Starts/stops one worker per enabled camera.

    Opening a camera (RTSP may take ~30 s) and loading a Detector are slow, so
    they never run under self.lock: online()/get() are called many times per
    second, also from async WebSocket handlers, and must not wait on them.
    """
    def __init__(self,detector,pose,required_ppe,persisted,trigger):
        self.detector=detector;self.pose=pose;self.required_ppe=required_ppe
        self.persisted=persisted;self.trigger=trigger
        self.entries={};self.lock=threading.RLock();self._first_detector_used=False
        self._reconcile_lock=threading.Lock()  # one reconcile at a time (loop + update())
        self.done=threading.Event()
        self.thread=threading.Thread(target=self._loop,daemon=True,name='CameraManager')
    # The first reconcile runs in the background thread so startup (and the API) is not held up.
    def start(self):self.thread.start()
    def stop(self):
        self.done.set();self.thread.join(timeout=4)
        with self.lock:
            items=[self.entries.pop(cid) for cid in list(self.entries)]
        for item in items:self._stop_item(item)
    @staticmethod
    def _stop_item(item):
        item['worker'].stop();item['worker'].join(timeout=3)
    def _build(self,cid,row):
        source=row['source'];source=int(source) if source.isdecimal() else source
        cam=Camera(source=source,width=1280,height=720,fps=30)
        st=DetectionState()
        # A tracker must NEVER be shared between different camera streams.
        if cid=='camera-01' and not self._first_detector_used:
            detector=self.detector;self._first_detector_used=True
        else:
            detector=Detector(
                self.detector.ppe_model_path, self.detector.person_model_path,
                confidence=self.detector.confidence, imgsz=self.detector.imgsz,
                ppe_confidence=self.detector.ppe_confidence,
                ppe_imgsz=self.detector.ppe_imgsz,
            )
        worker=YoloWorker(cam,detector,st,camera_id=cid,required_ppe=self.required_ppe,
            event_trigger_seconds=self.trigger,pose=self.pose,
            publish_url=(os.getenv('AI_PUBLISH_URL','rtsp://127.0.0.1:8554/camera01_ai')
                         if cid=='camera-01' else
                         f'rtsp://127.0.0.1:8554/{cid.replace("-", "")}_ai'))
        # Read settings now, not the copy from startup: engineers may have changed them since.
        settings=get_settings();self.persisted=settings
        if 'required_ppe' in settings:worker.analyzer.required_ppe=settings['required_ppe']
        for key in ('event_trigger_seconds','recovery_seconds','occlusion_seconds'):
            if key in settings:setattr(worker.event_manager,'trigger_seconds' if key=='event_trigger_seconds' else key,settings[key])
        return {'camera':cam,'worker':worker,'state':st,'source':row['source']}
    def reconcile(self):
        with self._reconcile_lock:
            rows=all_camera_settings()
            stopped=[];wanted=[]
            with self.lock:
                for row in rows:
                    cid=row['camera_id'];enabled=bool(row['is_active']) and bool(row['source'].strip())
                    old=self.entries.get(cid)
                    if old and (not enabled or old['source']!=row['source']):stopped.append(self.entries.pop(cid));old=None
                    if enabled and not old:wanted.append(row)
            for item in stopped:self._stop_item(item)
            for row in wanted:
                cid=row['camera_id']
                try:
                    item=self._build(cid,row)
                    with self.lock:self.entries[cid]=item
                    item['worker'].start()
                except Exception:logging.exception('Unable to start camera %s',cid)
    def _loop(self):
        while True:
            try:self.reconcile()
            except Exception:logging.exception('Camera management error')
            if self.done.wait(3):break
    def get(self,cid):
        with self.lock:return self.entries.get(cid)
    def online(self,cid):
        e=self.get(cid)
        if not e or not e['worker'].is_alive():return False
        cam=e['camera']
        if hasattr(cam,'meta'):fid,at=cam.meta()
        else:_,fid,at=cam.read_with_meta()
        return at is not None and time.time()-at<8
    def visible(self):
        rows=all_camera_settings()
        return [dict(camera_id=r['camera_id'],name=r['name'],location=r['location'],
             source_type=r['source_type'],is_active=True,online=True) for r in rows if r['is_active'] and self.online(r['camera_id'])]
    def engineering_list(self):
        return [dict(camera_id=r['camera_id'],name=r['name'],source_type=r['source_type'],
             is_active=bool(r['is_active']),online=self.online(r['camera_id']),
             source_configured=bool(r['source']),source=(r['source'] if r['source'].isdecimal() else '')) for r in all_camera_settings()]
    def update(self,cid,enabled,source=None):
        if cid not in IDS:raise ValueError('Unsupported camera ID')
        if source is not None:
            source=source.strip()
            if cid=='camera-01' and not source.isdecimal():raise ValueError('Laptop source must be a camera index')
            if cid=='camera-02' and source and not source.lower().startswith(('rtsp://','rtsps://')):raise ValueError('RTSP URL required')
        with get_connection() as db:
            if source is not None:db.execute('UPDATE camera_sources SET source=? WHERE camera_id=?',(source,cid))
            if enabled is not None:db.execute('UPDATE cameras SET is_active=?,updated_at=CURRENT_TIMESTAMP WHERE camera_id=?',(int(enabled),cid))
            db.commit()
        # reconcile immediately; disabling stops publish and notifications
        self.reconcile()
