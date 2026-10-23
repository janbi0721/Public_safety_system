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

- **開始工作前先讀 `progress.md`**：裡面有目前進度、使用者做過的決定、試過的方法和結果、已知 bug、下一步。做完一段工作後要更新它；長期規則才寫進這份 CLAUDE.md。
- **commit 時排除**：`backend/model/best.pt`（除非使用者明確要求）、`.env`、`.claude/`、`tools/`、`backend/backups/`、`backend/snapshots/`。commit 前要掃描暫存內容裡有沒有金鑰或含帳密的 RTSP 網址。
- **只能修改專案資料夾 `D:\專題` 內的檔案。** 不要動使用者層級設定（例如 `~/.codex`、全域 Claude 設定），要碰專案外的路徑前先問使用者。
- **`.env` 含機密**（`GEMINI_API_KEY`、`INITIAL_ADMIN_PASSWORD`、RTSP 帳密）。不要把內容印到輸出，檢查時只看 key 名稱。`.env` 已列入 `.gitignore`。
- **`backend/model/best.pt` 由使用者自己訓練和替換。** commit 時沒有明確指示就不要包含它。
- `backend/snapshots/` 是執行時產生的事件截圖，可能拍到人，不要 commit。
- 使用者用中文溝通，回覆也用繁體中文。
- **介面不要放說明文字**（使用者要求，包含主頁）：不要加副標題、頁面介紹、功能解說、提示框。可以保留的有：
  - 狀態資訊（例如「共 N 筆」、「畫面中 1 人」）。
  - 警報時的操作指示。
  - 刪除前確認對話框裡的警告。
  - 輸入框的 placeholder。
- 測試時不要讓自己啟動的伺服器占用或遮蔽使用者的 8000、5173：
  - 在 Windows 上，綁 `127.0.0.1:8000` 會跟使用者 `open.bat` 開的 `0.0.0.0:8000` 同時存在，本機請求會被測試伺服器接走。
  - 測試要用別的 port（例如後端 8010、Vite 5199）。測試完只關自己啟動的程序。
  - MediaMTX 的 port（8554、8889）寫死在 `mediamtx.yml`，只能在使用者的系統沒在跑時才能啟動測試用的 MediaMTX。
  - **清理測試時要連子程序一起關**（例如 `taskkill /T /PID`，或依父程序找出來），最後確認沒有殘留的 `ffmpeg.exe`。只關 Python 後端的話，ffmpeg 會變成孤兒，繼續占用 MediaMTX 頻道（2026-10-23 發生過，跑了十幾小時）。現在 `video_pipeline.py` 會把每個 ffmpeg 放進 Windows Job Object（`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`），後端結束（含 `taskkill /F`）時 Windows 會一併結束它們，但清理後還是要確認一次。
  - 測試用的資料庫放在專案裡的暫存資料夾。刪除前先 `gc.collect()` 關掉連線，否則 Windows 會鎖檔。
- `docs/system-flowchart.html` 是完整流程圖，已發布為 Artifact（https://claude.ai/artifact/Rq2YmXg25KZHuCEw5MH2MV）。改了流程、門檻或秒數時要一起更新，並用同一個檔案重新發布。

## 常用指令

一鍵啟動（Windows）：`open.bat` 會分別開三個命名過的 cmd 視窗啟動 MediaMTX、uvicorn、前端，等 5173 開始監聽後打開瀏覽器。`stop.bat` 依視窗標題關閉它們。啟動前根目錄必須有 `.env`。

- 前端視窗會先 `npm run build`，再用 `vite preview` 在 5173 提供打包後的網頁（一個 JS 檔、gzip 約 200KB）；打包失敗才改用 `npm run dev`。
- 原因：開發模式要載入 200 多個未打包的檔案（約 4.7MB、沒有壓縮），其他裝置透過 Wi-Fi 開網頁很慢（使用者回報過）。
- 所以**改了前端程式碼，要重新執行 `open.bat`（或重新 build）才會看到**；開發時要即時更新請另外跑 `npm run dev`。

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
npm run build                                      # 輸出到 frontend/dist（見下方 Node 24 注意事項）
npm run preview -- --host 0.0.0.0 --port 5173     # 提供打包後的網頁，open.bat 用這個
```

`.claude/launch.json` 有 `backend`、`frontend`（使用者的 port），以及測試用的 `backend-test`（8010）、`frontend-dev-test`（5199）、`frontend-preview-test`（5198），可用 Claude 內建瀏覽器的 preview 啟動。測試一律用測試用的設定。注意 `backend-test` 用的是正式的 `backend/safety.db`。

注意事項：
- 攝影機 02 已啟用但 RTSP 連不上時，OpenCV 要約 30 秒才逾時。開攝影機在 `Camera` 自己的讀取執行緒裡進行，第一次 `reconcile()` 也在背景跑，所以不會擋住 API（2026-10-23 修正前，啟動要約 50 秒 API 才有回應）。
- 找不到 ffmpeg（`FFMPEG_PATH` 或 PATH）時，AI 標註的 WebRTC 推流會直接跳過、不報錯，前端會自動改用 MJPEG 備援。
- ffmpeg 放在 `tools/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe`（2026-10-23 從 gyan.dev 下載，SHA-256 核對過），`.env` 的 `FFMPEG_PATH` 指向它。`tools/` 列在 `.gitignore`，不要 commit（約 115MB，超過 GitHub 單檔上限）。`libx264` 和 NVIDIA 的 `h264_nvenc` 都測過可以用。
- 每台攝影機只推 AI 標註畫面到 MediaMTX：`camera-01` → `camera01_ai`（`AI_PUBLISH_URL`），`camera-02` → `camera02_ai`。原始畫面（`camera01`）**從來不推**，不要拿它做檢查。
- 系統狀態頁（`pages/SystemStatus.jsx`）依工程師攝影機 API 列出每台攝影機：
  - 每台攝影機都列出 AI WebSocket、YOLO 即時資料、`<id>_ai` 的 WHEP 三項（使用者要求 RTSP 攝影機也要看得到）。
  - 啟用的攝影機一律實際測試，讀不到畫面時三項顯示「離線」，WHEP 註明「攝影機沒有畫面」。停用的顯示「停用」，不測試。
  - 2026-10-23 實測：ffmpeg 推流後 `camera01_ai` 正常，工人端以 WebRTC 播放 1280×720。
  - 內建瀏覽器面板在背景時，影片會暫停解碼，`videoWidth` 是 0，不代表沒有畫面。
- **Node 24.11.1 的 `fs.rmSync(路徑, {recursive: true})` 在含中文的路徑（`D:\專題`）會原生崩潰（錯誤碼 0xC0000409 / 3221226505）**，2026-10-23 確認：
  - `node -e "require('fs').rmSync('有內容的資料夾',{recursive:true})"` 在專案裡就會崩潰；`fs.promises.rm` 和純英文路徑都正常。
  - `npm run build` 以前會崩潰，就是因為 Vite 打包前用它清空 `dist`。現在 `vite.config.js` 設 `emptyOutDir: false`，改由外掛 `emptyOutDirSafely` 用 `fs.promises.rm` 清空。**不要把 `emptyOutDir` 改回 true。**
  - 自己寫的 Node 腳本要刪資料夾時，也要用 `fs.promises.rm`。
  - Vite 開發伺服器在**執行中**發現新的相依套件（例如新 import 一個 `@mui/icons-material/...` 圖示）並重新打包時也會崩潰，推測是同一個原因（清快取資料夾），還沒證實。處理方式：新增 import 後，先在 `frontend/` 執行 `npx vite optimize --force`（單獨執行不會崩潰），再啟動 `npm run dev`。

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
  - 工程師只能透過 API 修改 `EDITABLE` 白名單裡的欄位（目前 10 個），寫入時會保留其他欄位。
  - **改了沒作用的欄位不要放進白名單**：`CAMERA_SOURCE`、`CAMERA_2_SOURCE` 只在第一次啟動時寫進資料庫，之後要在工程師頁的攝影機管理改；`CAMERA_ID`、`VITE_MEDIAMTX_STREAM` 沒有程式使用。2026-10-23 已從白名單移除。
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
   - **穩定編號（`stable_identity.py`）**：BoT-SORT 遇到人短暫離開、回來時只露出半身，仍可能給新的 trackId（使用者回報過「離開一下編號就變」）。
     - worker 在偵測之後、判定之前呼叫 `StableIdentity.assign()`，把人員的 `trackId` 換成穩定編號，原本的號碼保留在 `rawTrackId`。
     - 新的 trackId 會跟「離開不到 `occlusion_seconds`（預設 30 秒）」的人比對上半身的 HSV 顏色直方圖。只有一個人離開、也只有一個新的人出現時，門檻放寬（0.25）；多人時要 ≥ 0.55，而且比第二名高 0.1。
     - 因為是在判定之前替換，事件、人員紀錄、畫框都會沿用同一個編號，回來時事件也會延續。
     - 認回舊編號時，會移除舊 raw ID 的對應，避免追蹤器之後把舊 raw ID 給別人時帶走這個編號。同一格裡若還是有兩個 raw ID 對到同一編號，帶著目前 raw ID 的人保留，另一人當新人處理。
     - 限制：後端重啟、跨攝影機、穿著完全相同的兩人同時進出時，還是可能換號。
   - PPE 模型抓裝備。
   - 輸出的 `className` 保留模型的原始類別名稱。
2. `PoseDetector.detect`：找出 COCO-17 關鍵點（頭、臉、手腕等）。
3. `SafetyAnalyzer.analyze`：把 PPE 指派給人員，判定每個人每項 PPE 是 `normal`、`violation` 還是 `unknown`。
4. `snapshot_service.draw`：畫框產生標註影像。
5. `EventManager.process`：**同一人、同一項 PPE 只會有一筆事件，一直延續到狀態真的改變為止**（使用者要求）。
   - 違規持續 `trigger_seconds`（預設 1.5 秒）才建立事件。還沒成立前：看到戴好就**立刻取消**；看不到或判不出來超過 `trigger_seconds` 也取消。（以前只有後者，兩格誤判夾著 1.3 秒戴好也會成立事件。）
   - 戴好並持續 `recovery_seconds`（2 秒），事件結束，結束原因記為 `recovered`。倒數中出現「無法判定」不會重新計時，只有再判到未戴好才會（以前偶爾一格無法判定，事件就永遠不會結束）。
   - 人離開畫面持續 `occlusion_seconds`（預設 30 秒，可設 5～600），事件結束，結束原因記為 `left_camera`，結束時間是**最後看到這個人**的時間（跟人員紀錄一致）。
   - worker 停止時，`EventManager.close_all()` 以 `system_stopped` 結束所有進行中的事件；後端被強制關閉的話，下次啟動時 `init_person_sessions()` 會把 `end_time` 是空的非模擬事件記為 `system_restart`。這兩種不存截圖、不寫人員時間軸。
   - `last_seen_time` 每 `LAST_SEEN_WRITE_SECONDS`（2 秒）才寫一次資料庫，不是每格都寫。
   - 人還在畫面裡但這項無法判定（轉身、手被擋住）時，事件**保持開啟**，不會結束後重開。
   - 三個時間都能在工程師頁的辨識設定調整，存在 `system_settings`。
   - 沒有 `trackId` 的違規不建立事件。
6. `VideoPublisher`：透過 FFmpeg 把 H.264 推到 MediaMTX，路徑是 `camera01_ai`、`camera02_ai`。寫入在獨立的推流執行緒，見下方「設計原則」。
7. 結果寫進該攝影機的 `state.DetectionState`，給 REST、WebSocket、MJPEG 讀取。

事件開始和結束時，`snapshot_service.capture` 會把原始圖和標註圖存到 `backend/snapshots/`。截圖只開放給已登入的使用者。

- **不要用 `cv2.imwrite`／`cv2.imread` 存取專案裡的檔案**：OpenCV 在 Windows 打不開含中文的路徑（`D:\專題`）。以前能用，是因為 ultralytics 載入時偷偷替換了這兩個函式。一律用 `cv2.imencode` 加 `Path.write_bytes`。
- worker 的影格存起來後不會再被修改，所以 `_latest_raw`、`_latest_annotated`、`_last_violation_frames` 直接存參照，不複製。`_last_violation_frames` 只保留還在待確認或進行中的違規。
- MJPEG 的 JPEG 由 `latest_jpeg()` 每格只編碼一次，所有觀看者共用。

### 設計原則（違反會讓整個系統卡住，2026-10-23 審查時發現）

- **偵測迴圈不能被任何 I/O 阻塞**：推流、截圖、資料庫寫入都不能無限期等待。
  - `VideoPublisher.publish()` 只把最新影格交給推流執行緒就返回，塞車時丟掉舊影格。
  - MediaMTX 沒開時 ffmpeg 不讀 stdin，寫入會永遠卡住：寫入卡住超過 `STALL_SECONDS`（8 秒）就強制結束 ffmpeg，失敗後等 `RETRY_SECONDS`（5 秒）再重開。
- **`CameraManager.lock` 裡不能做慢的事**：開攝影機（RTSP 最多 30 秒）、載入模型都要在鎖外完成。`online()`、`get()` 會被 WebSocket 這種 async 函式頻繁呼叫，握鎖太久會讓整個事件迴圈停住。
  - `reconcile()` 在鎖內只決定要停哪些、開哪些，停止 worker 和 `_build()`（建 Camera、Detector、worker）都在鎖外，最後才短暫上鎖放進 `entries`。
  - `_reconcile_lock` 讓背景迴圈和 `update()` 不會同時 reconcile。
- **async 函式（WebSocket）裡不能呼叫會等鎖或做大量運算的同步函式**。`online()` 用 `Camera.meta()` 只讀 frame_id 和時間，不複製影格；WebSocket 先比對 `state.sequence`，有新結果才 `get()`（deepcopy）。
- **同一張影格裡，每個穩定編號只能對應一個人**。EventManager、PersonRecorder 都用 `trackId` 當 key，重複會把兩個人的事件和紀錄混在一起。
- 清空、重設這類操作要考慮 worker 正在同時寫入：資料庫刪除和記憶狀態重設之間不能留空檔。一鍵清空會先取得每個 worker 的 `record_lock`（worker 執行 PersonRecorder 和 EventManager 時持有），在鎖內刪資料表、重設狀態，再放開。

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

### 帳號對話（`messaging.py`）

- 登入後的帳號（主管、工程師、管理員）可以一對一傳訊息。資料表是 `direct_messages`（`sender_id`、`recipient_id`、`body`、`created_at`、`read_at`），由 `v2_data.init_v2_db()` 呼叫 `init_messages()` 建立。
- **只有對話雙方看得到**，管理員也沒有特別權限。不能傳給自己、停用或不存在的帳號，每則最多 2000 字。
- API（`current_supervisor`）：
  - `GET /api/admin/messages/contacts`：其他帳號、最後一則訊息、未讀數。
  - `GET /api/admin/messages/unread`：未讀總數。
  - `GET /api/admin/messages/{id}`：對話內容，同時把對方傳來的標成已讀。
  - `POST /api/admin/messages/{id}`：傳送訊息。
  - 固定路徑要寫在 `/{other_id}` 前面。
- 前端是 `pages/Messages.jsx`（`/supervisor/messages`），用輪詢更新：對話每 3 秒重讀整段，讓「已讀」也會更新；聯絡人每 5 秒更新。側欄的未讀數字在 `SupervisorLayout` 的 `useUnreadMessages`，每 8 秒更新。
- 訊息不是事件資料，「一鍵清空事件資料」不會刪除。工程師頁免登入、沒有帳號，所以不提供對話。

### 多攝影機（`multi_cameras.py`）

- 攝影機 ID 固定為 `camera-01`（筆電攝影機）和 `camera-02`（RTSP）。
- 背景迴圈會定期 `reconcile()`，依照資料表 `cameras.is_active` 和 `camera_sources.source` 啟動或停止 worker，所以工程師在網頁上開關攝影機、換來源，都不用重啟。
- `.env` 只在第一次啟動時寫入來源，之後一律以資料庫為準。
- **每台攝影機都要有自己的 `Detector`**，因為 BoT-SORT 的追蹤狀態（含 ReID 外觀紀錄）不能跨影像串流共用。
- 建立 worker 時（`_build`）重新讀取 `system_settings`，不要用啟動時的副本，否則工程師改過的秒數在攝影機重開後會被還原。
- 筆電攝影機（數字來源）設定 MJPG 格式，一定要在設定解析度和 FPS **之後**設定才有效。YUY2 在 720p 只有 10 FPS，MJPG 實測約 15 FPS。
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
- `gemini_service.py`：Gemini 只會收到彙總後的統計數字，不能下 SQL，也不能呼叫任何工具。提示詞裡描述系統行為的句子（例如播報規則）要跟程式一致，改行為時要一起改。
- `event_statistics()` 的日期篩選、`by_day`、`by_hour` 用台灣時間（SQLite `'localtime'`），跟事件編號一樣；`start_time` 本身仍是 UTC。
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
- **版面一致性**（2026-10-23 依 ui-ux-pro-max 的「Minimalism & Swiss Style」整理）：
  - 主管端每一頁都用 `components/PageHeader.jsx`：外層 `<Page>` 統一留白和最大寬度，`<PageHeader title meta actions />` 放標題。**標題要跟側欄的名稱相同**，篩選和切換按鈕放在 `actions`。
  - 元件的共用樣式寫在 `buildTheme()` 的 `components` 裡（卡片預設外框、圓角 12、按鈕不加陰影、表格標題、鍵盤焦點的 2px 外框），頁面裡不要再各自覆寫。
  - 手機（600px 以下）的內文是 16px、`body2` 是 15px。
  - 圖示底色用中性的 `action.hover`，只有數字本身代表警示時才上色（例如待改善事件 > 0）。
  - 沒有資料時，顯示一行置中的灰字，例如「沒有連線中的攝影機」，不要用藍色的提示框。
  - 系統名稱一律寫「工安智慧監控」。頂部列在桌面版不重複顯示名稱。
  - **攝影機一律只顯示編號**「攝影機 01」，用 `pages/shared.js` 的 `cameraLabel(camera_id)`（使用者要求）。資料庫裡的 `cameras.name`（例如「筆電攝影機」）不再顯示。工程師資料庫管理的原始資料表除外。
  - 工人端影像上**不要**放 LIVE 和攝影機名稱，狀態列也**不要**放「AI 監控中」（使用者要求）。斷線時由右側面板顯示「監控訊號中斷」。影像上只保留 AI FPS 和警報徽章。
  - 「一般設定」頁已經刪掉，因為主題切換本來就在頂部列。`/supervisor/settings` 會導回儀表板。

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
- 前端沒有自動化測試。改完要跑 `npx eslint <改過的檔案>`，再用開發伺服器實際打開頁面確認，最後跑一次 `npm run build` 確認能打包（`open.bat` 靠它）。
- `database.get_connection()` 回傳的連線，用 `with` 區塊**只會 commit、不會關閉**。在 Windows 上，連線沒關閉前資料庫檔案會被鎖住，無法刪除或搬移。測試時暫存資料庫可能刪不掉，要刪檔前請用 `contextlib.closing`。
- 自動化測試不涵蓋實際硬體：攝影機、RTSP、GPU、MediaMTX、Gemini。要確認的話，就實際啟動後端，檢查 `/api/health` 和 `/api/public/cameras/camera-01/detections`。
