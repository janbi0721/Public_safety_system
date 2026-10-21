"""Regression tests for PPE merging, label mapping, rendering and camera path.

YOLO is stubbed intentionally: these tests do not claim a real-camera/model
accuracy measurement. They exercise the actual production Detector / worker /
SafetyAnalyzer / draw / stream code with deterministic fake model results.
"""
import importlib
import pickletools
import sys
import time
import types
import zipfile
from pathlib import Path

import numpy as np
import pytest


class FakeTensor:
    def __init__(self, data):
        self.data = data
    def cpu(self):
        return self
    def int(self):
        return FakeTensor([int(x) for x in self.data])
    def tolist(self):
        return self.data


class FakeBoxes:
    def __init__(self, bbox, ids=None):
        self.xyxyn = FakeTensor([x[0] for x in bbox])
        self.cls = FakeTensor([x[1] for x in bbox])
        self.conf = FakeTensor([x[2] for x in bbox])
        self.id = FakeTensor(ids) if ids is not None else None
    def __len__(self):
        return len(self.cls.data)


class FakeResult:
    def __init__(self, names, detections, ids=None):
        self.names = names
        self.boxes = FakeBoxes(detections, ids)
        self.orig_shape = (240, 320)


def fake_ultralytics(monkeypatch, *, ppe_has_person=False):
    calls = []
    names = {0: 'helmet', 1: 'respirator', 2: 'aluminized_gloves'}
    if ppe_has_person:
        names[3] = 'person'

    class FakeYOLO:
        def __init__(self, path):
            self.person = 'yolo11n' in path
            self.names = {0: 'person', 1: 'car'} if self.person else names
        def track(self, source, **kwargs):
            calls.append(('track', self.person, source, kwargs))
            if self.person:
                return [FakeResult(self.names, [([.1,.1,.9,.95], 0, .91)], [42])]
            return [FakeResult(self.names, [([.1,.1,.9,.95],3,.92),([.25,.12,.45,.24],0,.94)], [42, 43])]
        def predict(self, source, **kwargs):
            calls.append(('predict', self.person, source, kwargs))
            return [FakeResult(self.names, [
                ([.2,.10,.45,.23],0,.74),
                ([.32,.24,.49,.38],1,.52),
                ([.16,.50,.25,.57],2,.31),
                ([.68,.51,.78,.58],2,.39),
            ])]

    module = types.ModuleType('ultralytics')
    module.YOLO = FakeYOLO
    monkeypatch.setitem(sys.modules, 'ultralytics', module)
    import yolo_obj_detector
    importlib.reload(yolo_obj_detector)
    return yolo_obj_detector.Detector, calls


def test_best_model_has_three_expected_labels_without_executing_pickle():
    path = Path(__file__).resolve().parents[1] / 'model' / 'best.pt'
    with zipfile.ZipFile(path) as z:
        pkl = z.read(next(x for x in z.namelist() if x.endswith('/data.pkl')))
    ops = list(pickletools.genops(pkl))
    labels = {v for op,v,_ in ops if op.name in ('BINUNICODE','SHORT_BINUNICODE') and isinstance(v,str)}
    assert {'helmet','respirator','aluminized_gloves'} <= labels


def test_two_models_merge_all_ppe_from_same_bgr_frame(monkeypatch):
    Detector, calls = fake_ultralytics(monkeypatch)
    frame = np.zeros((240,320,3), dtype=np.uint8)
    detector = Detector('model/best.pt','model/yolo11n.pt',
                        confidence=.5, ppe_confidence=.20, ppe_imgsz=960)
    output = detector.detect(frame, frame_id=17, captured_at=123.4)
    assert output['frameId']==17 and output['capturedAt']==123.4
    assert output['frame']=={'width':320,'height':240}
    assert output['modelDetections']=={'person':1,'ppe':4}
    assert [d['className'] for d in output['detections']] == [
        'person','helmet','respirator','aluminized_gloves','aluminized_gloves'
    ]
    assert output['detections'][0]['trackId']==42
    assert [d['trackId'] for d in output['detections'][1:]]==[None]*4
    assert len(calls)==2
    assert calls[0][0]=='track' and calls[1][0]=='predict'
    assert calls[0][2] is frame and calls[1][2] is frame
    assert calls[0][3]['classes']==[0] and calls[0][3]['conf']==.5
    assert calls[1][3]['conf']==.2 and calls[1][3]['imgsz']==960


def test_single_model_retains_ppe_and_person(monkeypatch):
    Detector,calls=fake_ultralytics(monkeypatch, ppe_has_person=True)
    d=Detector('model/best.pt',confidence=.5,ppe_confidence=.2)
    out=d.detect(np.zeros((240,320,3),dtype=np.uint8))
    assert [x['className'] for x in out['detections']]==['person','helmet']
    assert out['modelDetections']=={'person':1,'ppe':1}
    assert len(calls)==1 and calls[0][0]=='track' and calls[0][3]['conf']==.2


def test_glove_alias_and_pose_free_positives():
    from safety_analyzer import SafetyAnalyzer
    b=lambda *x:dict(zip(('x1','y1','x2','y2'),x))
    det=lambda name,bb:{'className':name,'bbox':bb,'confidence':.85,'trackId':None}
    person=det('person',b(.1,.1,.9,.95))
    person['trackId']=42
    gear=[det('helmet',b(.24,.12,.42,.22)),
          det('respirator',b(.39,.25,.53,.37)),
          det('aluminized_gloves',b(.18,.50,.25,.57)),
          det('aluminized_gloves',b(.71,.50,.78,.57))]
    a=SafetyAnalyzer(['helmet','respirator','glove'], ['helmet','respirator','aluminized_gloves'])
    answer=a.analyze([person]+gear,poses=[])
    assert not answer['violations']
    assert {k:v['status'] for k,v in answer['people'][0]['ppe'].items()} == {
        'helmet':'normal','respirator':'normal','glove':'normal'}
    assert a.analyze([person,gear[2]],[])['people'][0]['ppe']['glove']['status']=='unknown'
    assert not a.analyze([person],[])['violations']


def test_real_renderer_draws_all_models(monkeypatch):
    from snapshot_service import draw
    Detector,_=fake_ultralytics(monkeypatch)
    image=np.zeros((240,320,3),dtype=np.uint8)
    detections=Detector('best.pt','yolo11n.pt').detect(image)['detections']
    result=draw(image,detections)
    assert image.sum()==0
    for obj in detections:
        b=obj['bbox']
        x,y=int(b['x1']*320),int(b['y1']*240)
        assert result[y,x].any(), f'No rectangle for {obj["className"]}'
    assert result.sum()>0


def test_stream_and_raw_endpoints_are_distinct(monkeypatch):
    fake = types.ModuleType('ultralytics')
    fake.YOLO = object
    monkeypatch.setitem(sys.modules, 'ultralytics', fake)
    import main
    from fastapi.responses import StreamingResponse
    routes = {r.path:r.endpoint for r in main.app.routes if hasattr(r,'path')}
    assert routes['/api/public/cameras/{camera_id}/stream'] is main.annotated_stream
    assert routes['/api/public/cameras/{camera_id}/ai.mjpg'] is main.annotated_stream
    assert routes['/api/public/cameras/{camera_id}/raw.mjpg'] is main.public_camera_raw_stream

    # The stream endpoint reads encoded annotated worker frames, not Camera.read.
    jpeg=b'FAKE_AI_JPEG_BYTES'
    class StubWorker:
        def latest_jpeg(self): return jpeg,101
    class StubManager:
        def __init__(self):self.n=0
        def get(self, camera_id):return {'worker':StubWorker()}
        def online(self, camera_id):
            self.n+=1
            return self.n<4
    manager=StubManager()
    req=types.SimpleNamespace(app=types.SimpleNamespace(state=types.SimpleNamespace(camera_manager=manager)))
    response=main.annotated_stream('camera-01',req)
    assert isinstance(response,StreamingResponse)
    import asyncio
    async def fetch_and_close():
        try:
            return await response.body_iterator.__anext__()
        finally:
            await response.body_iterator.aclose()
    assert jpeg in asyncio.run(fetch_and_close())


def test_worker_camera_frame_to_state_and_annotated_jpeg(monkeypatch):
    import cv2
    from state import DetectionState
    from worker import YoloWorker
    Detector,_=fake_ultralytics(monkeypatch)
    detector=Detector('model/best.pt','model/yolo11n.pt')
    original=np.zeros((240,320,3),dtype=np.uint8)

    class FakeCamera:
        def read_with_meta(self): return original.copy(), 7, 12345.0
        def release(self): pass

    monkeypatch.setenv('AI_STREAM_ENABLED','0')
    state=DetectionState()
    worker=YoloWorker(FakeCamera(),detector,state,required_ppe=['helmet','respirator','glove'])
    worker.start()
    try:
        deadline=time.monotonic()+3
        while state.get()['sequence']==0 and time.monotonic()<deadline:
            time.sleep(.01)
        got=state.get()
        assert got['sequence']>0, worker.error
        data=got['data']
        assert data['frameId']==7 and data['cameraId']=='camera-01'
        assert data['modelDetections']=={'person':1,'ppe':4}
        assert {x['className'] for x in data['detections']}=={
            'person','helmet','respirator','aluminized_gloves'}
        assert data['people'][0]['ppe']['glove']['status']=='normal'
        jpeg,fid=worker.latest_jpeg()
        assert fid==7 and jpeg
        decoded=cv2.imdecode(np.frombuffer(jpeg,dtype=np.uint8),cv2.IMREAD_COLOR)
        assert decoded is not None and decoded.shape==original.shape
        assert decoded.sum()>0 and original.sum()==0
    finally:
        worker.stop()
        worker.join(timeout=3)


def test_engineering_threshold_input_validation():
    import environment_config
    assert environment_config._validate('PPE_CONFIDENCE','0.15')=='0.15'
    assert environment_config._validate('PPE_IMGSZ','960')=='960'
    for bad in ('0','1.1','abc','nan','inf'):
        with pytest.raises(ValueError):
            environment_config._validate('PPE_CONFIDENCE',bad)
    for bad in ('0','111','fake','-32'):
        with pytest.raises(ValueError):
            environment_config._validate('PPE_IMGSZ',bad)
