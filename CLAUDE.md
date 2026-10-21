# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

工業安全監測系統 2.0，在 Windows 筆電上運行。系統用 YOLO 偵測人員與個人防護具（PPE：安全帽、防毒面具、手套），最多同時處理兩路攝影機。違規會建立事件並存截圖到 SQLite，再由 React 網頁顯示給工人、主管和工程師。

系統由三個程序組成：

| 程序 | 位置 | Port | 用途 |
|---|---|---|---|
| MediaMTX | `mediamtx/` | RTSP 8554、WebRTC 8889 | 轉發 AI 標註影像（WHEP） |
| FastAPI | `backend/` | 8000 | 偵測、事件、API、MJPEG |
| Vite + React | `frontend/` | 5173 | 網頁介面 |

介面文字、說明文件都用繁體中文。

## 協作規則

- **只能修改專案資料夾 `D:\專題` 內的檔案。** 不要動使用者層級設定（例如 `~/.codex`、全域 Claude 設定），要碰專案外的路徑前先問使用者。
- **`.env` 含機密**（`GEMINI_API_KEY`、`INITIAL_ADMIN_PASSWORD`、RTSP 帳密）。不要把內容印到輸出，檢查時只看 key 名稱。`.env` 已列入 `.gitignore`。
- **`backend/model/best.pt` 由使用者自己訓練和替換。** commit 時沒有明確指示就不要包含它。
- `backend/snapshots/` 是執行時產生的事件截圖，可能拍到人，不要 commit。
- 使用者用中文溝通，回覆也用繁體中文。

## 常用指令

一鍵啟動（Windows）：`open.bat` 會分別開三個命名過的 cmd 視窗啟動 MediaMTX、uvicorn、Vite，並打開瀏覽器。`stop.bat` 依視窗標題關閉它們。啟動前根目錄必須有 `.env`。

首次安裝：`install.bat`，會先 `pip install -r backend\requirements.txt`，再到 `frontend/` 執行 `npm ci`。torch 是 CUDA 11.8 版，透過 extra index 安裝。

個別啟動與測試：

```bash
# 後端（在 backend/ 執行）
python -m uvicorn main:app --host 0.0.0.0 --port 8000
python -m pytest                                    # 全部測試（需另外安裝 pytest）
python -m pytest tests/test_api.py::test_auth_required_and_config   # 單一測試
python diagnose_models.py --source 0               # 用攝影機或圖片測試兩個模型，輸出 debug_annotated.jpg

# 前端（在 frontend/ 執行；PowerShell 要用 npm.cmd）
npm run dev -- --host 0.0.0.0
npm run lint
npx eslint src/app/pages/Events.jsx                # 只檢查單一檔案
npx vite optimize --force                          # 新增 import 後先重新打包相依套件（見下方注意事項）
npm run build                                      # 這台電腦目前會崩潰，見下方注意事項
```

`.claude/launch.json` 有 `backend`、`frontend` 兩組設定，可用 Claude 內建瀏覽器的 preview 啟動。

注意事項：
- 後端啟動時，若攝影機 02 已啟用但 RTSP 連不上，OpenCV 會卡約 30 秒才逾時，這段時間 API 沒有回應。
- 找不到 ffmpeg（`FFMPEG_PATH` 或 PATH）時，AI 標註的 WebRTC 推流會直接跳過、不報錯，前端會自動改用 MJPEG 備援。
- **這台電腦的 Node 24 有原生崩潰問題（錯誤碼 0xC0000409 / 3221226505）**：
  - `npm run build` 會在 Rollup 打包階段崩潰，原因還沒找到，所以前端改完改用 lint 加開發伺服器驗證。
  - Vite 開發伺服器在**執行中**發現新的相依套件（例如新 import 一個 `@mui/icons-material/...` 圖示）並重新打包時也會崩潰。處理方式：新增 import 後，先在 `frontend/` 執行 `npx vite optimize --force`（單獨執行不會崩潰），再啟動 `npm run dev`。

## 網頁入口與角色

| 網址 | 對象 | 登入 |
|---|---|---|
| `/client/monitor` | 工人端畫面（即時影像、語音警告） | 不用 |
| `/supervisor/login` → `/supervisor/*` | 主管：儀表板、即時監控、事件、統計、AI 報告 | 要 |
| `/engineering` | 工程師維護頁，選單裡沒有連結，要手動輸入網址 | **不用**（使用者決定所有裝置都免登入） |

角色有 `supervisor`、`engineer`、`admin` 三種。主管帳號管理只有 `admin` 能用。工程師頁（含修改 `.env`、資料庫增刪改、一鍵清空事件）刻意開放給同網路的任何裝置，不要再加回登入限制，除非使用者要求。

## 設定（`.env`）

- **整個專案只有根目錄一份 `.env`**，前後端共用：`main.py` 讀取 `PROJECT_ROOT/.env`，`vite.config.js` 把 `envDir` 設為 `..`。不要新增 `frontend/.env`。
- 後端主要變數：
  - `CAMERA_SOURCE`（`0` 是本機攝影機，也可填 `rtsp://…`）、`CAMERA_2_SOURCE`
  - `PPE_MODEL`、`PERSON_MODEL`，預設 `./model/best.pt` 和 `./model/yolo11n.pt`；相對路徑先找 `backend/`，再找專案根目錄
  - `POSE_MODEL`：姿態模型，目前是 `./model/yolo11n-pose.pt`。**少了它系統就不會判違規**，見下方「PPE 判定」
  - `REQUIRED_PPE`、`EVENT_TRIGGER_SECONDS`、`PPE_CONFIDENCE`、`PPE_IMGSZ`
  - `AI_STREAM_ENABLED`、`AI_PUBLISH_URL`、`AI_STREAM_FPS`、`VIDEO_ENCODER`、`FFMPEG_PATH`
  - `GEMINI_API_KEY`、`GEMINI_MODEL`
  - `INITIAL_ADMIN_USERNAME`、`INITIAL_ADMIN_PASSWORD`：資料庫沒有主管帳號時，用來建立第一個帳號
- 前端變數：`VITE_API_BASE_URL`、`VITE_WS_BASE_URL`、`VITE_CAMERA_ID`、`VITE_MEDIAMTX_WHEP_BASE`、`VITE_MEDIAMTX_STREAM`。
- `environment_config.py` 是唯一能寫入 `.env` 的程式：
  - 工程師只能透過 API 修改 `EDITABLE` 白名單裡的欄位，寫入時會保留其他欄位。
  - API 絕不能回傳機密原值，也不能回傳含帳密的 RTSP 網址。
  - 不開放修改管理員密碼和模型路徑。
- `.env` 修改後要重啟 FastAPI 和 Vite 才會生效。
- **網頁上不能上傳或切換模型**。這是刻意移除的功能，不要加回來，模型資訊只能唯讀顯示。

## 後端架構（`backend/`）

模組都是平放的，彼此直接用檔名 import，沒有 package 結構，所以測試要把 `backend/` 加進 `sys.path`。所有 API 路由都在 `main.py`。

### 啟動流程（`main.py` 的 `lifespan`）

1. `init_db()` 建立基本資料表，內部會呼叫 `v2_data.init_v2_db()` 做 V2 遷移。如果沒有主管帳號，會建立初始帳號，並把密碼印在 console，只印這一次。
2. `multi_cameras.initialize_sources()` 第一次啟動時，把 `.env` 的攝影機來源寫進資料表 `camera_sources`。
3. 讀取 `system_settings`，包括 PPE 設定和框線顏色（`set_box_colors`）。
4. 建立 `Detector`（PPE 模型加人員模型）。有設定 `POSE_MODEL` 的話，再建立 `PoseDetector`。
5. `CameraManager.start()`。

### 偵測流程（每台攝影機一條執行緒）

`rtsp_cam.Camera`（OpenCV 讀影像的執行緒）→ `worker.YoloWorker`，每張影格依序經過：

1. `Detector.detect`：
   - 人員模型抓 `person`，用 BoT-SORT 加外觀辨識（ReID）追蹤，給每個人 `trackId`。設定在 `backend/trackers/person_botsort.yaml`：
     - `with_reid: True`、`model: auto`：直接用人員模型的特徵，不用另外的 ReID 模型。
     - `proximity_thresh: 0.0`：人從別的位置回來也能認回來。
     - `track_buffer: 300`：約 30 秒內回來都能保留原本的 ID。
     - 換回 ByteTrack 的話，人被擋一下就會換 ID，產生重複事件。
   - PPE 模型抓裝備。
   - 輸出的 `className` 保留模型的原始類別名稱。
2. `PoseDetector.detect`：找出 COCO-17 關鍵點（頭、臉、手腕等）。
3. `SafetyAnalyzer.analyze`：把 PPE 指派給人員，判定每個人每項 PPE 是 `normal`、`violation` 還是 `unknown`。
4. `snapshot_service.draw`：畫框產生標註影像。
5. `EventManager.process`：**同一人、同一項 PPE 只會有一筆事件，一直延續到狀態真的改變為止**（使用者要求）。
   - 違規持續 `trigger_seconds`（預設 1.5 秒）才建立事件。還沒成立就中斷的違規直接取消。
   - 戴好並持續 `recovery_seconds`（2 秒），事件結束，結束原因記為 `recovered`。
   - 人離開畫面持續 `occlusion_seconds`（預設 30 秒，可設 5～600），事件結束，結束原因記為 `left_camera`。
   - 人還在畫面裡但這項無法判定（轉身、手被擋住）時，事件**保持開啟**，不會結束後重開。
   - 三個時間都能在工程師頁的辨識設定調整，存在 `system_settings`。
   - 沒有 `trackId` 的違規不建立事件。
6. `VideoPublisher`：透過 FFmpeg 把 H.264 推到 MediaMTX，路徑是 `camera01_ai`、`camera02_ai`。
7. 結果寫進該攝影機的 `state.DetectionState`，給 REST、WebSocket、MJPEG 讀取。

事件開始和結束時，`snapshot_service.capture` 會把原始圖和標註圖存到 `backend/snapshots/`。截圖只開放給已登入的使用者。

### 人員紀錄（`person_recorder.py`）

- 每個 worker 有一個 `PersonRecorder`，在 `EventManager.process` **之前**執行。每次有人出現在攝影機前就是一筆人員紀錄。
- 資料表：
  - `person_sessions`：人員編號 `session_code`，格式 `YYYYMMDD-HHMMSS-PNNN`，用跟事件編號同一個 `_init_codes` 觸發器產生。另外記錄 `first_seen`、`last_seen`、`end_time`、`end_reason`。
  - `person_ppe_changes`：每項 PPE 狀態變化的時間點。
  - `events.person_session_id`：把事件綁到人員紀錄。
- **時間軸要和事件一致**：
  - 「未戴好」和「已改正」由 `EventManager` 在建立或以 `recovered` 結束事件時呼叫 `PersonRecorder.mark()` 寫入，時間點就是事件的判定時間。
  - 紀錄器自己只寫「從沒違規過、穩定正常 `recovery_seconds`」的「已戴好」。
  - 不要讓紀錄器自己另外判斷違規，兩邊的去抖動規則不同，會對不上。
- 「看不清楚」不寫入時間軸。`last_seen` 每 5 秒才寫一次資料庫。
- 人員紀錄的結束原因：
  - 離開鏡頭超過 `occlusion_seconds` → `left_camera`
  - worker 停止 → `system_stopped`
  - 上次沒正常關閉，下次啟動時由 `init_person_sessions` 補記 → `system_restart`
- 這裡的「人」是「這段時間出現在這台攝影機前的某個人」，**不是員工身分**。換攝影機或離開太久，就是另一筆紀錄。
- API：`GET /api/admin/people`（列表與摘要，支援日期、攝影機、關鍵字、`violated_only`）、`GET /api/admin/people/{id}`（時間軸和相關事件）。前端在 `pages/Events.jsx` 用「依事件／依人員」切換，人員畫面在 `pages/PeopleView.jsx`。統計和報告仍然只用 `events`。

### 多攝影機（`multi_cameras.py`）

- 攝影機 ID 固定為 `camera-01`（筆電攝影機）和 `camera-02`（RTSP）。
- 背景迴圈會定期 `reconcile()`，依照資料表 `cameras.is_active` 和 `camera_sources.source` 啟動或停止 worker，所以工程師在網頁上開關攝影機、換來源，都不用重啟。
- `.env` 只在第一次啟動時寫入來源，之後一律以資料庫為準。
- **每台攝影機都要有自己的 `Detector`**，因為 BoT-SORT 的追蹤狀態（含 ReID 外觀紀錄）不能跨影像串流共用。
- 只有 8 秒內有成功讀到影格的攝影機，才會出現在 `visible()` 和公開清單裡。

### PPE 判定（`safety_analyzer.py`）

- **類別別名**：`ALIASES` 把模型的原始類別名稱對應到系統內部名稱，例如：
  - `gas_mask` 或 `respirator` → `respirator`
  - `gloves` 或 `aluminized_gloves` → `glove`

  換模型時，只要類別名稱在別名表裡，就不用改程式；有新名稱的話，要加進 `ALIASES`。之後的事件、統計、前端都只用內部名稱（`helmet`、`respirator`、`glove`）。
- **指派範圍**：PPE 框的中心點必須在人員框內，而且在合理的身體區域才會算。例如安全帽在人員框上方 34%，防毒面具在 4% 到 47% 之間。
- **判定原則**：「看不到」不等於「沒戴」。要先由姿態模型確認部位露出來，才會判 `violation`：
  - 安全帽：要看得到頭部關鍵點，或偵測到 `head` 類別。
  - 防毒面具：要看得到鼻子。
  - 手套：兩隻手腕各自比對手套。
- 背對鏡頭、被遮住或出了畫面，判 `unknown`，不會誤報。**沒有設定 `POSE_MODEL` 時就只會出現 `normal` 和 `unknown`。** 使用者確認過要維持這個「看得到才判」的原則。
- 每個人預設三項都要檢查（`ALL_PPE`），每缺一項就是一筆獨立事件。`REQUIRED_PPE` 決定要檢查哪幾項，工程師頁的設定（存在 `system_settings`）優先於 `.env`。
- **事件類型**統一由 `EVENT_TYPES` 對應：`helmet`→`no_helmet`、`respirator`→`no_gas_mask`、`glove`→`no_gloves`，跟模擬事件、前端標籤（`pages/shared.js`）一致。`EventManager` 用反查表 `PPE_BY_EVENT` 判斷事件是否恢復正常。不要再用 `f'no_{name}'` 產生類型。

### 框線顏色（`snapshot_service.py`）

- 顏色以 `#RRGGBB` 格式依模型原始類別名稱設定。`__violation__` 是違規人員的顏色。
- 預設色在 `DEFAULT_BOX_COLORS`。沒有預設色的新類別，會用 `FALLBACK_COLORS` 依名稱 hash 自動分配一個固定顏色。
- 工程師頁「框線顏色」透過 `GET/PATCH /api/admin/engineering/box-colors` 修改：
  - 資料庫的 `system_settings['box_colors']` 只存跟預設不同的顏色。
  - 存檔後 `set_box_colors()` 會立即套用到即時畫面和之後的截圖，不用重啟。
- 類別清單從 `CameraManager.detector` 讀取，所以攝影機全關時也列得出來。
- 標籤文字會依底色亮度自動切換黑字或白字。

### 資料層

- `database.py`：
  - 基本資料表：`supervisors`、`sessions`、`cameras`、`events`。
  - 帳號驗證：密碼雜湊，登入後發 Bearer session token。
  - 資料庫位置 `DB_PATH = backend/safety.db`，使用 WAL 模式。
- `v2_data.py`：
  - 只做**增量、不破壞資料的遷移**：角色、`system_settings`、`audit_logs`、`event_snapshots`、審核欄位、`events.is_test`。
  - 也負責統計（`event_statistics`）。
  - 遷移絕不能刪除或清空既有資料。
- **模擬事件**（`is_test=1`）：
  - 會刻意算進所有統計、儀表板和 Gemini 報告，跟真實事件一樣。
  - `is_test` 只用來辨識哪些資料可以安全刪除。
  - 被審核為 `false_positive` 的事件不算進統計。
- `engineering_database.py`：
  - 工程師的資料庫管理只開放白名單資料表：`events` 和 `cameras` 可以增刪改查，`audit_logs` 唯讀。
  - 不開放任意 SQL，也不開放 `supervisors` 的密碼雜湊和 `sessions`。
  - 預設攝影機 `camera-01`，以及已經有事件的攝影機，都不能刪除。
  - `clear_event_data()`：一鍵清空事件、人員紀錄、事件截圖（資料列和 JPG 檔）、AI 安全報告，並重設內部編號。帳號、攝影機、設定、AI 對話、操作紀錄保留。API 是 `POST /api/admin/engineering/clear-events`，要傳 `confirm_text: "清空"`，執行前會先 `backup_database()`，並呼叫各 worker 的 `EventManager.reset()` 和 `PersonRecorder.reset()`。
- **事件編號** `events.event_code`：格式 `YYYYMMDD-HHMMSS-NNN`，日期時間是台灣當地時間，NNN 是當天流水號（當天最大號 + 1，刪除事件也不會重號）。由 `v2_data._init_codes()` 建立的 SQLite trigger 在新增時自動產生，舊資料在啟動時補上。觸發器名稱是 `trg_events_event_code`，人員編號是 `trg_person_sessions_session_code`；舊名 `trg_events_code` 會在啟動時被刪掉，避免執行兩次。內部數字 `id` 不變，截圖、審核、API 路徑仍用 `id`；畫面上顯示用前端的 `eventCode()`（`pages/shared.js`）。
- 備份 `maintenance.backup_database()` 必須用 `contextlib.closing` 關閉 sqlite 連線，否則 Windows 會鎖住暫存 `.db`，刪除時出錯，前端只會看到 `Failed to fetch`（500 錯誤回應沒有 CORS 標頭）。
- 事件查詢（`GET /api/admin/events`）：`database._event_filters()` 是 `get_events` 和 `count_events` 共用的條件，支援攝影機、改善狀態、`start`/`end`（瀏覽器傳 ISO 時間，後端轉成 UTC 字串比對，`end` 不含）、事件類型、審核狀態、關鍵字 `q`（說明、備註、攝影機、事件編號、人員 ID）。回傳 `events` 和 `total`，前端 `pages/Events.jsx` 用它做搜尋列和分頁。
- `gemini_service.py`：Gemini 只會收到彙總後的統計數字，不能下 SQL，也不能呼叫任何工具。
- 工程師的寫入操作會用 `audit()` 留下操作紀錄。

### API 分層（`main.py`）

- **不用登入**：`/api/public/*`、`/api/health`、`/ws/cameras/{id}`。用途是工人端畫面、MJPEG 串流（`.../stream`、`.../ai.mjpg`、`.../raw.mjpg`）、偵測結果和語音音量。
- **登入**：`/api/auth/*`，登入後回傳 Bearer token。
- **管理 API**：`/api/admin/*` 要登入（`current_supervisor`）。主管帳號管理用 `admin_only = require_role('admin')`。
- **工程師 API**：`/api/admin/engineering/*` 和 `/api/admin/system/metrics` 用 `engineer` 依賴，**不用登入**。有 engineer/admin 的 token 會回傳該帳號，否則回傳 `PUBLIC_ENGINEER`（`id` 為 `None`，操作紀錄的帳號欄位會是空的）。工程師頁不能呼叫需要主管登入的 API。
- **CORS**：只允許 localhost 和私有網段 IP 的 5173 port，規則在 `main.py` 的 regex。

## 前端架構（`frontend/src/app/`）

React 18 + MUI 6 + react-router 6，用 JS/JSX，`app` 是 `src/app` 的別名。

- **全站統一色票**在 `ThemeMode.jsx` 的 `TOKENS`，有 `light` 和 `dark` 兩組，由 `buildTheme()` 放進 MUI 主題（`palette.hmi`，以及 primary、error、success、warning、background、text、divider）。
  - 主色是鋼藍（淺 `#1D5FD1`／深 `#4C9AFF`），只用在按鈕和連結。
  - `alarm`、`ok`、`warn` 有固定意義，不要拿來當裝飾色。
  - 側欄用 `hmi.nav`（兩種模式都是深色導覽）。`AppBar` 預設是中性底色加細分隔線，不要用主色色塊。
  - 圖表用 `hmi.chart`。
  - 文字和背景的組合都檢查過符合 WCAG AA。深色模式的 `alarm` 特地調成 `#D63A3F`，讓白字能過 4.5:1。改色票時要重新檢查對比。
  - `app/theme.js` 是舊檔，沒有被使用。

- 路由都在 `routes.jsx`：
  - `AuthGuard` 檢查是否登入。
  - `RoleGuard roles={[...]}` 檢查角色。
  - 版面元件：`layout/SupervisorLayout.jsx`、`layout/EngineeringLayout.jsx`。
- 工程師頁 `pages/EngineerMaintenance.jsx`：
  - 左側選單由 `SECTIONS` 陣列定義，每個功能是一個內部元件，例如 `BoxColors`、`VoiceSettings`、`TestEvents`。
  - 新增功能時照這個模式做。
- `services/api.js` 是唯一的 HTTP 客戶端：
  - token 存在 localStorage，key 是 `aiSafetySupervisorToken`。
  - 會把 `VITE_API_BASE_URL`、`VITE_WS_BASE_URL`、`VITE_MEDIAMTX_WHEP_BASE` 裡的 localhost 換成目前網頁的主機名稱，讓同網路的手機可以連到筆電。
- 影像顯示（`components/CameraView.jsx`）：優先用 MediaMTX 的 WebRTC WHEP（`<stream>_ai`），連不上就改用後端 MJPEG。
- 畫框全部由後端完成，`components/DetectionOverlay.jsx` 目前沒有任何頁面使用。
- 即時警示（`components/SafetyAlarm.jsx`，工人端 `PublicMonitor` 和主管端 `LiveMonitor` 共用）：
  - 後端 `EventManager.process` 回傳的 `alerts` 包含**所有還沒結束的事件**，不只這一格偵測到的。每筆都有 `eventId` 和 `inView`（這個人目前在不在畫面）。所以判定閃一下，警示也不會消失。
  - `useAlarmVoice`：每個 `eventId` 只播報一次。先響警報音（Web Audio），再把同一人的新事件合成一句話。用 `speechSynthesis` 排隊播放，不要用 `cancel()` 打斷。事件結束後就會忘記這個 `eventId`，之後的新違規會再播報。
  - 主管端用 `AlarmBanner`（紅色閃爍大橫幅）和 `alarmFrameSx`（影像外框紅色發光）。`useAlarmTitle`：分頁標題顯示「⚠ (N) 安全警告」。
  - **工人端 `PublicMonitor` 必須固定一個螢幕、不能捲動**（使用者要求：畫面掛在牆上，沒人會去捲）：
    - 根元素是 `height: 100dvh; overflow: hidden`，影像用 `CameraView fill` 填滿剩下的高度，不要用等比例的寬度撐高。
    - **視覺風格是工業監控介面（ISA-101 high-performance HMI）**，使用者嫌之前的大紅閃爍版「太廉價」：
      - 跟全站一樣可以選淺色、深色、跟隨系統（狀態列有 `ModeSelect`）。顏色一律從主題的 `palette.hmi` 取（`useHmi()`），不要在元件裡寫死色碼。
      - 平常是中性灰階，**只有異常才用顏色**：紅色是警報，綠色是正常，琥珀色是連線中斷。
      - **只有新警報會閃**：`useNewAlarm` 在新的 `eventId` 出現後閃 6 秒，之後維持穩定的紅色。不要改回持續閃爍、白底紅字大膠囊、超大海報字。
    - 元件：
      - `AlarmScreenFrame`：螢幕四周 4px 紅框。
      - `VideoOverlay`：影像上的 LIVE、攝影機名稱、AI FPS、警報徽章。
      - `WorkerStatusPanel`：狀態標題、每人一張 PPE 檢查表（`PersonRow`／`PpeTile`，已戴好 ✓、未戴好 ✕、無法判定 –）、底部操作指示。
    - 檢查表的資料來自 `panelPeople()`：合併畫面中的 `people`（每項 PPE 狀態）和還沒結束、但人不在畫面裡的事件。
    - 人很多時只有面板內部可以捲動。新增任何元素都要確認 1280×720、1366×768、1920×1080、直立平板、手機都沒有捲軸。
  - 不要改回「每格依 alerts 重新判斷要不要講」的做法，那會讓同一人一直重複播報（使用者回報過）。

## 測試

- 後端測試在 `backend/tests/`，用 pytest 搭配 FastAPI `TestClient`。fixture 的寫法參考 `tests/conftest.py`、`tests/test_api.py`：
  - 把 `database.DB_PATH` 改到 `tmp_path`。
  - 設定 `INITIAL_ADMIN_*` 環境變數。
  - 用假模組替換 `sys.modules['ultralytics']`。
  - 不觸發 lifespan，這樣不會開攝影機或 GPU。

  新的 API 測試照這個模式寫。
- `tests/test_ppe_dual_model_fix.py` 有一個測試會讀取真正的 `model/best.pt`，並寫死舊模型的類別名稱（`respirator`、`aluminized_gloves`）。目前的模型是 `helmet`、`gloves`、`gas_mask`，所以這個測試會失敗，但不影響系統運作。
- 驗證工人端時，要模擬「現場正常」可以在瀏覽器裡包一層 `window.WebSocket`，把收到的 `alerts` 清空、`people[].ppe` 改成 normal。要模擬「監控中斷」就停掉後端。這樣不用動後端或資料庫。
- 目前的 Python 環境**沒有安裝 pytest**（使用者表示平常執行系統不需要它；要安裝前先問）。`test_v2.py` 在 2026-10-21 用簡易方式執行過：9 個裡 8 個通過，剩下 1 個需要 `monkeypatch` 所以沒跑成。
- 前端沒有自動化測試。改完要跑 `npx eslint <改過的檔案>`，再用開發伺服器實際打開頁面確認（`npm run build` 目前會崩潰）。
- `database.get_connection()` 回傳的連線，用 `with` 區塊**只會 commit、不會關閉**。在 Windows 上，連線沒關閉前資料庫檔案會被鎖住，無法刪除或搬移。測試時暫存資料庫可能刪不掉，要刪檔前請用 `contextlib.closing`。
- 自動化測試不涵蓋實際硬體：攝影機、RTSP、GPU、MediaMTX、Gemini。要確認的話，就實際啟動後端，檢查 `/api/health` 和 `/api/public/cameras/camera-01/detections`。
