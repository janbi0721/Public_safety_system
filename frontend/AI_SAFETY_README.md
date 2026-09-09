# AI 工安智慧監控前端（MatX 改版）

此版本已將 MatX Demo 改成可直接接目前 FastAPI / YOLO 後端的工安監控前端。

## 已接的後端介面

- `GET /api/health`
- `GET /api/events`
- `GET /api/cameras/{camera_id}/events`
- `GET /api/cameras/{camera_id}/detections`
- `WS /ws/cameras/{camera_id}`

## MediaMTX

`CameraPanel` 使用 WHEP 將 MediaMTX WebRTC 串流放進 `<video>`，並將 YOLO WebSocket 的 normalized bbox 疊在影像上。

預設環境變數：

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_WS_BASE_URL=ws://127.0.0.1:8000
VITE_CAMERA_ID=camera-01
VITE_MEDIAMTX_WHEP_BASE=http://127.0.0.1:8889
VITE_MEDIAMTX_STREAM=camera01
```

因此前端會向：

- FastAPI: `http://127.0.0.1:8000`
- WebSocket: `ws://127.0.0.1:8000/ws/cameras/camera-01`
- MediaMTX WHEP: `http://127.0.0.1:8889/camera01/whep`

連線。

## 啟動

```powershell
npm install
npm run dev
```

瀏覽器：`http://localhost:5173`

後端另外啟動：

```powershell
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## 頁面

- `/dashboard` 儀表板
- `/monitor` 即時監控
- `/events` SQLite 安全事件
- `/cameras` 攝影機管理雛形
- `/system` 系統狀態

## 注意

SQLite 的 `events` 應只保存 SafetyAnalyzer / EventManager 產生的安全事件，例如 `no_helmet`、`no_gas_mask`、`no_gloves`、`fall_detected`，不要把每一幀 YOLO 的 `head` / `helmet` detection 都寫入資料庫。
