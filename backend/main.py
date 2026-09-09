import asyncio

from contextlib import asynccontextmanager

from fastapi import (
    FastAPI,
    WebSocket,
    WebSocketDisconnect
)

from fastapi.middleware.cors import (
    CORSMiddleware
)

from rtsp_cam import Camera
from yolo_obj_detector import Detector
from state import DetectionState
from worker import YoloWorker

from database import (
    init_db,
    get_events,
    get_events_by_camera
)


# ========================
# Camera
# ========================

camera = Camera(
    source=0
)


# ========================
# YOLO
# ========================

detector = Detector(
    model_path="./model/best.pt",
    confidence=0.5
)


# ========================
# Shared State
# ========================

state = DetectionState()


# ========================
# Worker
# ========================

worker = YoloWorker(
    camera=camera,
    detector=detector,
    state=state,
    camera_id="camera-01"
)


# ========================
# Lifespan
# ========================

@asynccontextmanager
async def lifespan(app: FastAPI):

    # SQLite
    init_db()

    # YOLO
    worker.start()

    yield

    worker.stop()

    worker.join(
        timeout=3
    )


app = FastAPI(
    title="AI Safety Monitoring API",
    lifespan=lifespan
)


# ========================
# CORS
# ========================

app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "http://localhost:5173"
    ],

    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# ========================
# Health
# ========================

@app.get("/api/health")
def health():

    return {
        "status": "ok",
        "worker":
            worker.is_alive(),
        "text": "你的FESTAPI有在動 真強"
    }


# ========================
# Current detections
# ========================

@app.get(
    "/api/cameras/{camera_id}/detections"
)
def get_detections(
    camera_id: str
):

    return state.get()


# ========================
# All Events
# ========================

@app.get("/api/events")
def events(
    limit: int = 100
):

    return {
        "events":
            get_events(limit)
    }


# ========================
# Camera Events
# ========================

@app.get(
    "/api/cameras/{camera_id}/events"
)
def camera_events(
    camera_id: str,
    limit: int = 100
):

    return {
        "cameraId":
            camera_id,

        "events":
            get_events_by_camera(
                camera_id,
                limit
            )
    }


# ========================
# WebSocket
# ========================

@app.websocket(
    "/ws/cameras/{camera_id}"
)
async def websocket_camera(
    websocket: WebSocket,
    camera_id: str
):

    await websocket.accept()

    last_sequence = -1

    try:

        while True:

            snapshot = state.get()

            sequence = snapshot[
                "sequence"
            ]

            if (
                sequence
                != last_sequence
            ):

                await websocket.send_json(
                    snapshot["data"]
                )

                last_sequence = (
                    sequence
                )

            await asyncio.sleep(
                0.05
            )

    except WebSocketDisconnect:

        print(
            "WebSocket "
            "disconnected: "
            f"{camera_id}"
        )