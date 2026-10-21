# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Industrial safety monitoring system (工業安全監測系統 2.0), Windows-targeted. YOLO detects people and PPE (helmet, respirator/gas mask, glove, vest) on up to two camera inputs. It records violation events with snapshots in SQLite and serves a React dashboard. Three processes run together: MediaMTX (WebRTC/RTSP relay), FastAPI (`backend/`, port 8000) and Vite (`frontend/`, port 5173). User-facing docs and UI strings are in Traditional Chinese.

## Commands

Run the whole stack (Windows): `open.bat` starts MediaMTX, uvicorn and Vite in separate titled cmd windows. `stop.bat` kills them by window title. It requires a root `.env`.

Individually:

```bash
# backend (from backend/)
python -m uvicorn main:app --host 0.0.0.0 --port 8000
python -m pytest                                   # all tests
python -m pytest tests/test_api.py::test_auth_required_and_config   # single test
python diagnose_models.py --help                   # run both detectors on an image/camera

# frontend (from frontend/; on Windows PowerShell use npm.cmd)
npm install
npm run dev -- --host 0.0.0.0
npm run build
npm run lint
```

First-time setup: `install.bat` (pip-installs `backend/requirements.txt`, then `npm ci` in `frontend/`). Torch is CUDA 11.8 via an extra index.

## Configuration

- There is a **single `.env` at the repo root**, shared by backend and frontend. `main.py` loads `PROJECT_ROOT/.env`, and `vite.config.js` sets `envDir` to `..`. Do not add `frontend/.env`. The file holds secrets (`GEMINI_API_KEY`, `INITIAL_ADMIN_PASSWORD`, RTSP credentials) and is gitignored.
- Key backend vars: `CAMERA_SOURCE` (`0` = local webcam, or `rtsp://…`), `CAMERA_2_SOURCE`, `PPE_MODEL`/`PERSON_MODEL` (default `backend/model/best.pt` and `yolo11n.pt`), `REQUIRED_PPE`, optional `POSE_MODEL`, `EVENT_TRIGGER_SECONDS`, `AI_PUBLISH_URL`/`AI_STREAM_ENABLED`, `GEMINI_MODEL`.
- `environment_config.py` is the only sanctioned `.env` writer. Engineers can edit a whitelist of keys via the API. It must never return raw secrets or RTSP URLs with credentials to the frontend, and it must preserve the other keys.
- Model files cannot be uploaded or switched from the web UI. This was intentionally removed, so don't reintroduce it.

## Backend architecture (`backend/`)

Flat modules imported by name (no package), so tests add `backend/` to `sys.path`.

**Detection pipeline (threads, started in `main.py` `lifespan`):**
`init_db()` (also runs `v2_data.init_v2_db()` migrations) → `multi_cameras.initialize_sources()` → build `Detector` (+ optional `PoseDetector`) → `CameraManager.start()`.

- `multi_cameras.CameraManager` manages the fixed ids `camera-01`/`camera-02`. A background loop `reconcile()`s against the SQLite tables `cameras.is_active` + `camera_sources.source`, so engineers toggle and retarget cameras at runtime without a restart. `.env` values only seed `camera_sources` on first run; after that the DB is authoritative. Each camera gets its own `Detector` instance because the ByteTrack tracker state must never be shared across streams. Only cameras with a frame in the last ~8 s are `visible()` in public listings.
- Per camera: `rtsp_cam.Camera` (threaded OpenCV reader) → `worker.YoloWorker` thread. Each frame goes through `Detector.detect` → `SafetyAnalyzer.analyze`, which associates PPE boxes to people (optionally using pose keypoints) and yields violations. Then `snapshot_service.draw` annotates the frame, `EventManager.process` debounces violations into DB events (start after `trigger_seconds`, end/close_reason), and `VideoPublisher` pushes H.264 via FFmpeg to MediaMTX (`cameraXX_ai`). Results go into a per-camera `state.DetectionState`, which REST/WebSocket/MJPEG endpoints read.
- Event start/end transitions call `snapshot_service.capture` to store raw and annotated evidence images (under `backend/snapshots`, served only to authenticated users).

**Data layer:**
- `database.py`: base schema (supervisors, sessions, cameras, events) and auth (password hashing, bearer session tokens). `DB_PATH = backend/safety.db` (WAL mode). Tests monkeypatch `database.DB_PATH`.
- `v2_data.py`: additive V2 tables and non-destructive migrations (roles, settings, audit log, snapshots, reviews, `events.is_test`), plus statistics. Migrations must never drop or erase existing rows.
- Simulated events (`is_test=1`) are deliberately counted in all statistics, dashboards and Gemini reports. The flag only identifies which rows are safe to delete.
- `engineering_database.py`: restricted CRUD over whitelisted tables only (`events`, `cameras`, read-only `audit_logs`). It has no arbitrary SQL and never exposes `supervisors` hashes or `sessions`.
- `gemini_service.py`: Gemini receives only minimized aggregated stats (no SQL/tools).

**API (`main.py`, all routes in one file):**
- `/api/public/*`, `/api/health`, `/ws/cameras/{id}`: no login (worker client view, MJPEG streams `.../stream` and `.../ai.mjpg`, voice settings).
- `/api/auth/*`: login returns a bearer token.
- `/api/admin/*`: requires a login. Role checks use `require_role(...)`: `engineer = require_role('engineer','admin')`, `admin_only = require_role('admin')`. `/api/admin/engineering/*` is engineer/admin only. Supervisor account management is admin only.
- CORS allows only port 5173 on localhost and private-LAN IPs (regex in `main.py`).

## Frontend architecture (`frontend/src/app/`)

React 18 + MUI 6 + react-router 6 (JS/JSX, alias `app` → `src/app`). Routes are in `routes.jsx`:
- `/client/monitor`: public worker screen (`PublicMonitor`).
- `/supervisor/*`: `AuthGuard` + `SupervisorLayout`. `supervisors` is wrapped in `RoleGuard roles={["admin"]}`.
- `/engineering`: hidden URL with no menu link, engineer/admin only (`EngineeringLayout` → `EngineerMaintenance`). Hiding the URL is not security; the backend enforces roles.

`services/api.js` is the single HTTP client. It stores the token in localStorage (`aiSafetySupervisorToken`), and it rewrites loopback hosts in `VITE_API_BASE_URL`/`VITE_WS_BASE_URL`/`VITE_MEDIAMTX_WHEP_BASE` to `window.location.hostname`, so phones on the same LAN reach the laptop. Video prefers WebRTC WHEP from MediaMTX (port 8889) and falls back to the backend MJPEG endpoints.

## Tests

`backend/tests/` uses pytest with FastAPI `TestClient`. The fixture pattern (see `test_api.py`) points `database.DB_PATH` at `tmp_path`, sets `INITIAL_ADMIN_*` env vars, stubs `sys.modules['ultralytics']`, and avoids the app lifespan so no camera or GPU is opened. Keep new API tests on that pattern. There are no frontend tests. Real hardware (webcam, RTSP, GPU, MediaMTX, Gemini) has not been verified by the test suite.
