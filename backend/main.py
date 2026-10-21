from __future__ import annotations

import asyncio
import os
import sqlite3
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from dotenv import load_dotenv

import cv2
from fastapi import (
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel, Field
from datetime import date, timedelta
import json, shutil, re
from v2_data import get_settings,save_settings,event_statistics,init_v2_db,audit,list_snapshots,remove_snapshot,review_event
from database import get_connection
from gemini_service import ask_gemini
from maintenance import backup_database,health_metrics
from environment_config import list_environment,save_environment
from v2_data import create_test_event,list_test_events,delete_test_event
from engineering_database import catalog as engineering_db_catalog, browse as engineering_db_browse, create_row as engineering_db_create, update_row as engineering_db_update, delete_row as engineering_db_delete

from database import (
    count_active_supervisors,
    create_session,
    create_supervisor,
    delete_session,
    delete_supervisor,
    get_camera,
    get_cameras,
    get_event,
    get_events,
    get_schema,
    get_supervisor,
    get_supervisor_auth_by_username,
    get_supervisor_by_token,
    get_supervisors,
    init_db,
    set_event_improved,
    update_supervisor,
    verify_password,
)
from rtsp_cam import Camera
from schemas import EventImprovedUpdate, LoginRequest, SupervisorCreate, SupervisorUpdate
from state import DetectionState
from multi_cameras import CameraManager,initialize_sources
from worker import YoloWorker
from yolo_obj_detector import Detector


BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
load_dotenv(PROJECT_ROOT / ".env")
CAMERA_ID = os.getenv("CAMERA_ID", "camera-01")
CAMERA_SOURCE_RAW = os.getenv("CAMERA_SOURCE", "0")
CAMERA_SOURCE = int(CAMERA_SOURCE_RAW) if CAMERA_SOURCE_RAW.isdigit() else CAMERA_SOURCE_RAW
PPE_MODEL = os.getenv("PPE_MODEL", str(BASE_DIR / "model" / "best.pt"))
PERSON_MODEL = os.getenv("PERSON_MODEL", str(BASE_DIR / "model" / "yolo11n.pt"))
REQUIRED_PPE = [
    item.strip()
    for item in os.getenv("REQUIRED_PPE", "helmet,respirator,glove").split(",")
    if item.strip()
]

def resolve_model(path):
    candidate = Path(path)
    if candidate.is_absolute(): return str(candidate)
    local = BASE_DIR / candidate
    return str(local if local.is_file() else PROJECT_ROOT / candidate)

state = DetectionState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    initial_account = init_db()
    if initial_account:
        print("=" * 64)
        print("首次啟動：已建立主管帳號（此密碼只會顯示這一次）")
        print(f"username: {initial_account['username']}")
        print(f"password: {initial_account['password']}")
        print("登入後請立即修改密碼。")
        print("=" * 64)

    initialize_sources()
    persisted = get_settings()
    selected_model=persisted.get('active_model_path') or PPE_MODEL
    detector=Detector(
        ppe_model_path=resolve_model(selected_model),
        person_model_path=resolve_model(PERSON_MODEL),
        confidence=0.5,
        imgsz=640,
        ppe_confidence=float(os.getenv("PPE_CONFIDENCE", "0.20")),
        ppe_imgsz=int(os.getenv("PPE_IMGSZ", "640")),
    )
    pose=None
    pose_path=os.getenv('POSE_MODEL','').strip()
    if pose_path:
        try:
            from pose_detector import PoseDetector
            pose=PoseDetector(resolve_model(pose_path))
        except Exception as error:print('Pose model unavailable:',error)
    manager=CameraManager(detector,pose,REQUIRED_PPE,persisted,float(os.getenv('EVENT_TRIGGER_SECONDS','1.5')))
    app.state.camera_manager=manager
    manager.start()
    yield
    manager.stop()


app = FastAPI(
    title="AI Safety Monitoring API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://10.207.33.9:5173",
    ],
    allow_origin_regex=r"^https?://(?:localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):5173$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Authentication helpers
# ---------------------------------------------------------------------------


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="需要主管登入",
        )
    return authorization[7:].strip()


def current_supervisor(
    authorization: Annotated[str | None, Header()] = None,
):
    token = _extract_bearer_token(authorization)
    supervisor = get_supervisor_by_token(token)
    if not supervisor:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登入已失效，請重新登入",
        )
    return supervisor


def current_token(
    authorization: Annotated[str | None, Header()] = None,
):
    return _extract_bearer_token(authorization)


def require_role(*allowed):
    def check(user: dict = Depends(current_supervisor)):
        if user.get('role') not in allowed:raise HTTPException(403,'無權限執行此操作')
        return user
    return check

engineer= require_role('engineer','admin')
admin_only=require_role('admin')


# ---------------------------------------------------------------------------
# Health / public client endpoints (no login required)
# ---------------------------------------------------------------------------


def _camera_entry(request,camera_id):
    manager=getattr(request.app.state,'camera_manager',None)
    if not manager or not manager.online(camera_id):raise HTTPException(404,'Camera offline or disabled')
    return manager.get(camera_id)

@app.get('/api/health')
def health(request:Request):
    mgr=getattr(request.app.state,'camera_manager',None)
    visible=mgr.visible() if mgr else []
    return {'status':'ok' if visible else 'degraded','cameraFresh':bool(visible),
            'cameras':visible,'worker':bool(visible),'cameraId':visible[0]['camera_id'] if visible else None}

@app.get('/api/public/cameras')
def public_cameras(request:Request):
    mgr=getattr(request.app.state,'camera_manager',None)
    return {'cameras':mgr.visible() if mgr else []}

@app.get('/api/public/cameras/{camera_id}/detections')
def public_detections(camera_id:str,request:Request):return _camera_entry(request,camera_id)['state'].get()

@app.get('/api/cameras/{camera_id}/detections')
def get_detections(camera_id:str,request:Request):return public_detections(camera_id,request)

@app.get('/api/public/cameras/{camera_id}/alerts')
def public_alerts(camera_id:str,request:Request):
    data=_camera_entry(request,camera_id)['state'].get()['data'];t=data.get('timestamp')
    return {'cameraId':camera_id,'timestamp':t,'alerts':data.get('alerts',[]),
            'monitoringOnline':bool(t and time.time()-t<10)}

def _mjpeg_generator(camera,active=lambda:True):
    last=None
    while active():
        frame,fid,at=camera.read_with_meta()
        if frame is None or fid==last:time.sleep(.05);continue
        last=fid;ok,enc=cv2.imencode('.jpg',frame,[int(cv2.IMWRITE_JPEG_QUALITY),80])
        if ok:yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n'+enc.tobytes()+b'\r\n'

@app.get('/api/public/cameras/{camera_id}/raw.mjpg')
def public_camera_raw_stream(camera_id:str,request:Request):
    """Explicit raw-camera endpoint (no AI rectangles)."""
    e=_camera_entry(request,camera_id)
    return StreamingResponse(_mjpeg_generator(e['camera'],lambda:request.app.state.camera_manager.online(camera_id)),media_type='multipart/x-mixed-replace; boundary=frame',headers={'Cache-Control':'no-store'})

@app.websocket('/ws/cameras/{camera_id}')
async def websocket_camera(websocket:WebSocket,camera_id:str):
    mgr=getattr(websocket.app.state,'camera_manager',None)
    if not mgr or not mgr.online(camera_id):await websocket.close(code=1008);return
    await websocket.accept();last=-1
    try:
        while mgr.online(camera_id):
            entry=mgr.get(camera_id)
            if not entry:break
            snap=entry['state'].get()
            if snap['sequence']!=last:
                await websocket.send_json(snap['data']);last=snap['sequence']
            await asyncio.sleep(.08)
    except WebSocketDisconnect:pass
    finally:
        try:await websocket.close()
        except Exception:pass

# ---------------------------------------------------------------------------
# Supervisor authentication
# ---------------------------------------------------------------------------


@app.post("/api/auth/login")
def login(payload: LoginRequest):
    supervisor = get_supervisor_auth_by_username(payload.username)
    if (
        not supervisor
        or not bool(supervisor["is_active"])
        or not verify_password(
            payload.password,
            supervisor["password_salt"],
            supervisor["password_hash"],
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="帳號或密碼錯誤",
        )

    token, expires_at = create_session(supervisor["id"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_at": expires_at,
        "supervisor": get_supervisor(supervisor["id"]),
    }


@app.post("/api/auth/logout")
def logout(
    token: str = Depends(current_token),
    _: dict = Depends(current_supervisor),
):
    delete_session(token)
    return {"ok": True}


@app.get("/api/auth/me")
def auth_me(supervisor: dict = Depends(current_supervisor)):
    return supervisor


# ---------------------------------------------------------------------------
# Supervisor-only event management
# ---------------------------------------------------------------------------


@app.get("/api/admin/events")
def admin_events(
    limit: int = 100,
    offset: int = 0,
    camera_id: str | None = None,
    is_improved: bool | None = None,
    _: dict = Depends(current_supervisor),
):
    return {
        "events": get_events(
            limit=limit,
            offset=offset,
            camera_id=camera_id,
            is_improved=is_improved,
        )
    }


@app.get("/api/admin/events/{event_id}")
def admin_event_detail(
    event_id: int,
    _: dict = Depends(current_supervisor),
):
    event = get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@app.patch("/api/admin/events/{event_id}/improved")
def admin_update_event_improved(
    event_id: int,
    payload: EventImprovedUpdate,
    supervisor: dict = Depends(current_supervisor),
):
    event = set_event_improved(
        event_id=event_id,
        is_improved=payload.is_improved,
        supervisor_id=supervisor["id"],
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


# Keep old event reads during frontend migration, but require supervisor login.
@app.get("/api/events")
def legacy_events(
    limit: int = 100,
    _: dict = Depends(current_supervisor),
):
    return {"events": get_events(limit=limit)}


@app.get("/api/cameras/{camera_id}/events")
def legacy_camera_events(
    camera_id: str,
    limit: int = 100,
    _: dict = Depends(current_supervisor),
):
    return {
        "cameraId": camera_id,
        "events": get_events(limit=limit, camera_id=camera_id),
    }


# ---------------------------------------------------------------------------
# Supervisor account management
# ---------------------------------------------------------------------------


@app.get("/api/admin/supervisors")
def admin_supervisors(_: dict = Depends(admin_only)):
    return {"supervisors": get_supervisors()}


@app.post("/api/admin/supervisors", status_code=201)
def admin_create_supervisor(
    payload: SupervisorCreate,
    _: dict = Depends(admin_only),
):
    try:
        return create_supervisor(
            username=payload.username,
            password=payload.password,
            display_name=payload.display_name,
            role=payload.role,
        )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="帳號名稱已存在")


@app.patch("/api/admin/supervisors/{supervisor_id}")
def admin_update_supervisor(
    supervisor_id: int,
    payload: SupervisorUpdate,
    current: dict = Depends(admin_only),
):
    if supervisor_id == current["id"] and payload.is_active is False:
        raise HTTPException(status_code=400, detail="不能停用目前登入中的自己")

    target = get_supervisor(supervisor_id)
    if not target:
        raise HTTPException(status_code=404, detail="Supervisor not found")

    if (
        target["is_active"]
        and payload.is_active is False
        and count_active_supervisors() <= 1
    ):
        raise HTTPException(status_code=400, detail="至少需要保留一個啟用中的主管帳號")

    try:return update_supervisor(
        supervisor_id,
        display_name=payload.display_name,
        password=payload.password,
        is_active=payload.is_active,
        role=payload.role,
    )
    except ValueError as error:raise HTTPException(400,str(error))


@app.delete("/api/admin/supervisors/{supervisor_id}")
def admin_delete_supervisor(
    supervisor_id: int,
    current: dict = Depends(admin_only),
):
    if supervisor_id == current["id"]:
        raise HTTPException(status_code=400, detail="不能刪除目前登入中的自己")

    target = get_supervisor(supervisor_id)
    if not target:
        raise HTTPException(status_code=404, detail="Supervisor not found")

    if target["is_active"] and count_active_supervisors() <= 1:
        raise HTTPException(status_code=400, detail="至少需要保留一個啟用中的主管帳號")

    try:delete_supervisor(supervisor_id)
    except ValueError as e:raise HTTPException(400,str(e))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Admin camera / schema helper endpoints
# ---------------------------------------------------------------------------


@app.get("/api/admin/cameras")
def admin_cameras(request:Request,_:dict=Depends(current_supervisor)):
    return {'cameras':request.app.state.camera_manager.visible()}


@app.get("/api/admin/database/schema")
def admin_database_schema(_: dict = Depends(current_supervisor)):
    return {"tables": get_schema()}


# ---------------------------------------------------------------------------
# V2: roles, evidence, analytics, Gemini, engineering
# ---------------------------------------------------------------------------


@app.get('/api/public/cameras/{camera_id}/stream')
@app.get('/api/public/cameras/{camera_id}/ai.mjpg')
def annotated_stream(camera_id:str,request:Request):
    entry=_camera_entry(request,camera_id)
    def frames():
        last=None
        while True:
            mgr=getattr(request.app.state,'camera_manager',None)
            current=mgr.get(camera_id) if mgr else None
            if not current or not mgr.online(camera_id):break
            worker=current['worker']
            jpeg,fid=worker.latest_jpeg()
            if jpeg is None or fid==last:time.sleep(.05);continue
            last=fid
            yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n'+jpeg+b'\r\n'
    return StreamingResponse(frames(),media_type='multipart/x-mixed-replace; boundary=frame',headers={'Cache-Control':'no-store'})

@app.get('/api/admin/events/{event_id}/snapshots')
def snapshots(event_id:int,_:dict=Depends(current_supervisor)):
    if not get_event(event_id):raise HTTPException(404,'Event not found')
    return {'snapshots':list_snapshots(event_id)}

@app.get('/api/admin/snapshots/{snapshot_id}/image')
def snapshot_image(snapshot_id:int,_:dict=Depends(current_supervisor)):
    from snapshot_service import ROOT
    with get_connection() as db:row=db.execute('SELECT filename FROM event_snapshots WHERE id=?',(snapshot_id,)).fetchone()
    if not row:raise HTTPException(404,'Snapshot not found')
    path=ROOT/Path(row['filename']).name
    if not path.is_file():raise HTTPException(404,'Image missing')
    return FileResponse(path,media_type='image/jpeg')

@app.delete('/api/admin/snapshots/{snapshot_id}')
def delete_snapshot(snapshot_id:int,user:dict=Depends(current_supervisor)):
    from snapshot_service import ROOT
    row=remove_snapshot(snapshot_id)
    if not row:raise HTTPException(404,'Snapshot not found')
    (ROOT/Path(row['filename']).name).unlink(missing_ok=True)
    audit(user['id'],'delete_snapshot',{'snapshot_id':snapshot_id})
    return {'ok':True}

class Review(BaseModel):
    status:str
    note:str=''

@app.patch('/api/admin/events/{event_id}/review')
def event_review(event_id:int,payload:Review,user:dict=Depends(current_supervisor)):
    if not review_event(event_id,payload.status,user['id'],payload.note):raise HTTPException(404,'Event not found')
    audit(user['id'],'review_event',{'event':event_id,'status':payload.status})
    return get_event(event_id)

@app.get('/api/admin/analytics')
def analytics(start:str|None=None,end:str|None=None,camera_id:str|None=None,_:dict=Depends(current_supervisor)):
    today=date.today(); start=start or str(today-timedelta(days=6));end=end or str(today)
    try:
        a=date.fromisoformat(start);z=date.fromisoformat(end)
        if z<a or (z-a).days>366:raise ValueError()
    except ValueError:raise HTTPException(422,'無效的日期範圍')
    return event_statistics(start,end,camera_id)

@app.get('/api/admin/system/metrics')
def system_metrics(request:Request,_:dict=Depends(engineer)):
    manager=getattr(request.app.state,'camera_manager',None)
    worker=next(iter(manager.entries.values()))['worker'] if manager and manager.entries else None
    return health_metrics(worker)

@app.get('/api/admin/ai/conversations')
def ai_conversations(user:dict=Depends(current_supervisor)):
    with get_connection() as db:
        rows=db.execute('SELECT * FROM ai_conversations WHERE supervisor_id=? ORDER BY id DESC LIMIT 100',(user['id'],)).fetchall()
    return {'conversations':[dict(r) for r in rows]}

@app.get('/api/admin/ai/conversations/{conversation_id}')
def ai_history(conversation_id:int,user:dict=Depends(current_supervisor)):
    with get_connection() as db:
        conversation=db.execute('SELECT id FROM ai_conversations WHERE id=? AND supervisor_id=?',(conversation_id,user['id'])).fetchone()
        if not conversation:raise HTTPException(404,'Conversation not found')
        messages=db.execute('SELECT id,role,content,created_at FROM ai_messages WHERE conversation_id=? ORDER BY id',(conversation_id,)).fetchall()
    return {'messages':[dict(m) for m in messages]}

class ChatRequest(BaseModel):
    message:str=Field(min_length=1,max_length=4000)
    conversation_id:int|None=None

@app.post('/api/admin/ai/chat')
def ai_chat(payload:ChatRequest,user:dict=Depends(current_supervisor)):
    end=date.today(); start=end-timedelta(days=29)
    dates=re.findall(r'\b\d{4}-\d{2}-\d{2}\b',payload.message)
    if dates:
        try:
            requested=[date.fromisoformat(v) for v in dates[:2]]
            start=min(requested);end=max(requested)
            if len(requested)==1:end=start
        except ValueError: pass
    context=json.dumps(event_statistics(str(start),str(end)),ensure_ascii=False)
    history=[]
    with get_connection() as db:
        cid=payload.conversation_id
        if cid:
            row=db.execute('SELECT id FROM ai_conversations WHERE id=? AND supervisor_id=?',(cid,user['id'])).fetchone()
            if not row:raise HTTPException(404,'Conversation not found')
            history=[dict(r) for r in db.execute('SELECT role,content FROM ai_messages WHERE conversation_id=? ORDER BY id DESC LIMIT 10',(cid,))][::-1]
    try:answer=ask_gemini(payload.message,context,history)
    except Exception as error:raise HTTPException(503,str(error))
    with get_connection() as db:
        if not cid:
            cid=db.execute('INSERT INTO ai_conversations(supervisor_id,title) VALUES(?,?)',(user['id'],payload.message[:40])).lastrowid
        db.executemany('INSERT INTO ai_messages(conversation_id,role,content) VALUES(?,?,?)',[(cid,'user',payload.message),(cid,'model',answer)])
    return {'conversation_id':cid,'answer':answer}

class ReportRequest(BaseModel):
    start:str
    end:str

@app.post('/api/admin/ai/reports')
def generate_report(payload:ReportRequest,user:dict=Depends(current_supervisor)):
    try:
        a=date.fromisoformat(payload.start); z=date.fromisoformat(payload.end)
        if a>z or (z-a).days>366:raise ValueError()
    except ValueError:raise HTTPException(422,'無效的日期範圍')
    stats=event_statistics(payload.start,payload.end)
    try:body=ask_gemini('請根據以下資料產生繁體中文工業安全報告，包含統計、趨勢、問題與改善建議，不可編造數值。',json.dumps(stats,ensure_ascii=False))
    except Exception as error:raise HTTPException(503,str(error))
    with get_connection() as db:
        rid=db.execute('INSERT INTO safety_reports(supervisor_id,start_date,end_date,body) VALUES(?,?,?,?)',(user['id'],payload.start,payload.end,body)).lastrowid
    return {'id':rid,'body':body,'stats':stats}

@app.get('/api/admin/ai/reports')
def reports(user:dict=Depends(current_supervisor)):
    with get_connection() as db:rows=db.execute('SELECT * FROM safety_reports WHERE supervisor_id=? ORDER BY id DESC LIMIT 100',(user['id'],)).fetchall()
    return {'reports':[dict(r) for r in rows]}

@app.get('/api/admin/engineering/config')
def engineering_config(request:Request,_:dict=Depends(engineer)):
    mgr=getattr(request.app.state,'camera_manager',None)
    worker=next(iter(mgr.entries.values()))['worker'] if mgr and mgr.entries else None
    return {'settings':get_settings(),'model':Path(worker.detector.ppe_model_path).name if worker else Path(PPE_MODEL).name,'classes':list(worker.detector.ppe_names.values()) if worker else [],'required_ppe':worker.analyzer.required_ppe if worker else REQUIRED_PPE,'pose_enabled':bool(worker and worker.pose)}

class EngineeringSettings(BaseModel):
    required_ppe:list[str]|None=None
    event_trigger_seconds:float|None=Field(None,ge=.5,le=20)
    recovery_seconds:float|None=Field(None,ge=.5,le=30)
    occlusion_seconds:float|None=Field(None,ge=.5,le=30)

@app.patch('/api/admin/engineering/config')
def update_engineering(payload:EngineeringSettings,request:Request,user:dict=Depends(engineer)):
    data=payload.model_dump(exclude_none=True)
    if 'required_ppe' in data and not set(data['required_ppe']).issubset({'helmet','respirator','glove'}):raise HTTPException(422,'不支援的 PPE')
    mgr=getattr(request.app.state,'camera_manager',None)
    for e in list(mgr.entries.values()) if mgr else []:
        worker=e['worker']
        if 'required_ppe' in data:worker.analyzer.required_ppe=data['required_ppe']
        for key in ('recovery_seconds','occlusion_seconds','event_trigger_seconds'):
            if key in data:setattr(worker.event_manager,'trigger_seconds' if key=='event_trigger_seconds' else key,data[key])
    save_settings(data);audit(user['id'],'engineering_config',data)
    return {'settings':get_settings()}

@app.post('/api/admin/engineering/backup')
def engineering_backup(user:dict=Depends(engineer)):
    path=backup_database();audit(user['id'],'backup_created',{'file':Path(path).name})
    return {'ok':True,'filename':Path(path).name}

@app.get('/api/admin/engineering/audit')
def engineering_audit(_:dict=Depends(engineer)):
    with get_connection() as db:rows=db.execute('SELECT id,supervisor_id,action,created_at FROM audit_logs ORDER BY id DESC LIMIT 100').fetchall()
    return {'logs':[dict(x) for x in rows]}



class EnvironmentUpdate(BaseModel):
    changes: dict[str, str] = Field(min_length=1, max_length=12)

@app.get('/api/admin/engineering/environment')
def engineering_environment(_:dict=Depends(engineer)):
    return list_environment()

@app.patch('/api/admin/engineering/environment')
def update_engineering_environment(payload:EnvironmentUpdate,user:dict=Depends(engineer)):
    try:
        changed=save_environment(payload.changes)
    except ValueError as error:
        raise HTTPException(422,str(error)) from error
    audit(user['id'],'environment_keys_updated',{'keys':changed})
    return {'ok':True,'updated_keys':changed,'restart_required':True}


def _voice_volume():
    value=get_settings().get('voice_volume',80)
    try:return max(0,min(100,int(value)))
    except (TypeError, ValueError):return 80

@app.get('/api/public/voice-settings')
def public_voice_settings():
    # Worker page does not require login; return volume only, never .env or secrets.
    return {'volume':_voice_volume()}

@app.get('/api/admin/engineering/voice')
def engineering_voice(_:dict=Depends(engineer)):
    return {'volume':_voice_volume()}

class VoiceUpdate(BaseModel):
    volume:int=Field(ge=0,le=100)

@app.patch('/api/admin/engineering/voice')
def update_engineering_voice(payload:VoiceUpdate,user:dict=Depends(engineer)):
    save_settings({'voice_volume':payload.volume})
    audit(user['id'],'voice_volume_updated',{'volume':payload.volume})
    return {'volume':payload.volume,'message':'語音音量設定已儲存'}

class TestEventInput(BaseModel):
    event_type:str
    camera_id:str=Field(default='camera-01',min_length=1,max_length=48)
    track_id:int|None=Field(default=None,ge=1,le=999999)
    note:str=Field(default='',max_length=160)
    resolved:bool=True

_TEST_EVENT_MESSAGES={
    'no_helmet':'未配戴安全帽',
    'no_gas_mask':'未配戴防毒面具',
    'no_gloves':'未配戴隔熱手套',
    'fall_detected':'人員跌倒',
}

@app.post('/api/admin/engineering/test-events',status_code=201)
def engineering_create_test_event(payload:TestEventInput,user:dict=Depends(engineer)):
    if payload.event_type not in _TEST_EVENT_MESSAGES:
        raise HTTPException(422,'不支援的測試事件類型')
    if not get_camera(payload.camera_id):
        raise HTTPException(422,'攝影機 ID 不存在')
    message=_TEST_EVENT_MESSAGES[payload.event_type]
    if payload.note.strip():message+=' — '+payload.note.strip()
    event_id=create_test_event(payload.camera_id,payload.event_type,message,payload.track_id,payload.resolved)
    audit(user['id'],'create_test_event',{'event_id':event_id,'type':payload.event_type})
    return {'ok':True,'event_id':event_id,'message':'模擬事件已寫入事件資料庫，會納入事件列表、統計與 AI 報告'}

@app.get('/api/admin/engineering/test-events')
def engineering_test_events(_:dict=Depends(engineer)):
    return {'events':list_test_events()}

@app.delete('/api/admin/engineering/test-events/{event_id}')
def engineering_delete_test_event(event_id:int,user:dict=Depends(engineer)):
    if not delete_test_event(event_id):
        raise HTTPException(404,'找不到測試事件或不能刪除正式事件')
    audit(user['id'],'delete_test_event',{'event_id':event_id})
    return {'ok':True}


# Restricted SQLite CRUD: events and camera metadata; audit trail is read-only.
# The API never accepts SQL or exposes account credentials / access tokens.
class EngineeringDatabaseValues(BaseModel):
    values: dict[str, object] = Field(min_length=1, max_length=15)

class EngineeringDatabaseDelete(BaseModel):
    confirmed: bool

@app.get('/api/admin/engineering/database/tables')
def engineering_database_tables(_:dict=Depends(engineer)):
    return {'tables':engineering_db_catalog()}

@app.get('/api/admin/engineering/database/{table}')
def engineering_database_browse(table:str,limit:int=30,offset:int=0,search:str='',_:dict=Depends(engineer)):
    try: return engineering_db_browse(table,limit,offset,search)
    except ValueError as error: raise HTTPException(422,str(error)) from error

@app.post('/api/admin/engineering/database/{table}',status_code=201)
def engineering_database_create(table:str,payload:EngineeringDatabaseValues,user:dict=Depends(engineer)):
    try: row=engineering_db_create(table,payload.values)
    except PermissionError as error: raise HTTPException(403,str(error)) from error
    except ValueError as error: raise HTTPException(422,str(error)) from error
    audit(user['id'],'database_row_created',{'table':table,'row_id':row.get('id',row.get('camera_id'))})
    return {'ok':True,'row':row}

@app.patch('/api/admin/engineering/database/{table}/{row_id}')
def engineering_database_update(table:str,row_id:str,payload:EngineeringDatabaseValues,user:dict=Depends(engineer)):
    try: row=engineering_db_update(table,row_id,payload.values)
    except PermissionError as error: raise HTTPException(403,str(error)) from error
    except ValueError as error: raise HTTPException(422,str(error)) from error
    if row is None: raise HTTPException(404,'找不到指定資料')
    audit(user['id'],'database_row_updated',{'table':table,'row_id':row_id,'columns':list(payload.values)})
    return {'ok':True,'row':row}

@app.delete('/api/admin/engineering/database/{table}/{row_id}')
def engineering_database_delete(table:str,row_id:str,payload:EngineeringDatabaseDelete,user:dict=Depends(engineer)):
    if payload.confirmed is not True: raise HTTPException(400,'請先確認刪除操作')
    try: deleted=engineering_db_delete(table,row_id)
    except PermissionError as error: raise HTTPException(403,str(error)) from error
    except ValueError as error: raise HTTPException(409,str(error)) from error
    if not deleted: raise HTTPException(404,'找不到指定資料')
    audit(user['id'],'database_row_deleted',{'table':table,'row_id':row_id})
    return {'ok':True}

class CameraToggle(BaseModel):
    enabled:bool|None=None
    source:str|None=Field(None,max_length=2048)

@app.get('/api/admin/engineering/cameras')
def engineering_camera_list(request:Request,_:dict=Depends(engineer)):
    return {'cameras':request.app.state.camera_manager.engineering_list()}

@app.patch('/api/admin/engineering/cameras/{camera_id}')
def engineering_camera_toggle(camera_id:str,payload:CameraToggle,request:Request,user:dict=Depends(engineer)):
    if payload.enabled is None and payload.source is None:raise HTTPException(422,'No changes')
    try:request.app.state.camera_manager.update(camera_id,payload.enabled,payload.source)
    except ValueError as e:raise HTTPException(422,str(e))
    audit(user['id'],'camera_settings',{'camera_id':camera_id,'enabled':payload.enabled,'source_updated':payload.source is not None})
    return {'cameras':request.app.state.camera_manager.engineering_list()}
