# YOLO 雙模型 PPE 修正說明（2026-10-20）

## 結論

本專案的 `model/best.pt`（以不執行 pickle 的方式檢查 checkpoint 的類別中繼資料）含有：

| id | PPE 類別 |
|---|---|
| 0 | helmet |
| 1 | respirator |
| 2 | aluminized_gloves |

`model/yolo11n.pt` 含 `person`，PPE 模型沒有 `person`，因此原規劃的 **YOLO11n person 追蹤 + best.pt PPE 預測** 是正確架構。

原始程式有以下可重現問題：

1. `safety_analyzer.py` 的手套 ALIASES 缺少 `aluminized_gloves`，因此穿戴判定可能回傳 `model_unsupported`。
2. `/api/public/cameras/{camera_id}/stream` 返回**原始攝影機畫面**，不會顯示後端 AI 畫框；原本的 `/ai.mjpg` 才會傳 AI 影像。
3. Person/PPE 兩模型皆使用 `conf=0.5`，可能先把較小且分數較低的 PPE 過濾掉。
4. `POSE_MODEL` 未配置時，原本 Respirator / Glove 即使有偵測框也可能一律顯示 `unknown`。
5. `REQUIRED_PPE` 預設只有 helmet，不會預設評估 respirator / glove。
6. 第一台攝影機的發布 RTSP 位址在 CameraManager 內固定寫死，導致 `AI_PUBLISH_URL` 設定可能不生效。

**上述程式問題已修正，但本 ZIP 不包含真實攝影機測試影片、未實測 YOLO 權重對現場畫面的偵測召回率。**

## 修正內容

- `yolo_obj_detector.py`：Person 模型做追蹤，PPE 模型在同一張 BGR frame 上做 predict；分別配置 threshold，原始類別名稱與正規化 bbox 均保留；新增 `modelDetections`（person/ppe 數量）方便檢測。單模型含 `person` 時仍可用原本追蹤模式。
- `safety_analyzer.py`：將 `aluminized_gloves` / `aluminized_glove` 歸到分析用 `glove`；當無姿態模型時，偵測到面部 PPE 或兩件不同手套仍可給正向 `normal`。若缺少 PPE 且無足夠姿態證據，仍維持 `unknown`，不會直接報未穿戴。
- `snapshot_service.py`：統一繪製 Person/PPE 方框，區分類別配色、完整名稱文字並裁切到畫面範圍。
- `main.py`：`/api/public/cameras/{camera_id}/stream` 現與 `/ai.mjpg` 一樣輸出已畫框 JPEG；若需原始影像請改用 `/raw.mjpg`。`REQUIRED_PPE` 預設 `helmet,respirator,glove`（資料庫先前儲存的工程設定優先）。
- `multi_cameras.py`：額外攝影機使用相同 PPE threshold/imgsz；第一台攝影機讀取 `AI_PUBLISH_URL`。
- `environment_config.py`：允許在工程師環境變數設定中管理 `PPE_CONFIDENCE` 和 `PPE_IMGSZ`，需要重新啟動才會生效。
- `diagnose_models.py`：附上本地照片／攝影機快速診斷腳本，單次輸出模型結果及帶框圖片，不上傳影像。
- `tests/test_ppe_dual_model_fix.py`：新增 8 個測試，覆蓋兩模型、類別、畫框與攝影機流程。

## 替換與啟動

1. **先備份原本的 `backend/`、資料庫 `safety.db` 及 `.env`**。建議停止服務後再更換檔案，不要把舊資料庫覆蓋到仍在運作的系統。修正包內兩份 `.pt` 權重與原 ZIP 相同，未經再訓練；原始 `safety.db` 也保留。
2. 用修正包內的 `backend/` 內容替換原 backend。此 ZIP 沒有附 `.env`，沿用原專案根目錄 `.env`。
3. 確認原 Python 環境已安裝 `requirements.txt` 中的套件；使用原本的方式啟動。若不確定，從 backend 目錄執行：

   ```bash
   python -m uvicorn main:app --host 0.0.0.0 --port 8000
   ```

4. 若需調整 PPE 推論門檻，在原本 `.env` 設定或經工程師環境管理頁面加入：

   ```dotenv
   PPE_CONFIDENCE=0.20
   PPE_IMGSZ=640
   REQUIRED_PPE=helmet,respirator,glove
   ```

   `PPE_CONFIDENCE` 可先試 0.20；還是抓不到較小 PPE 時可試 0.10，代價是誤判框可能增加。`PPE_IMGSZ=960` 有機會改善小物件辨識，但會增加 GPU 使用率與延遲。`REQUIRED_PPE` 是啟動預設，資料庫已存的 `required_ppe` 設定會覆蓋它，請檢查工程師設定頁。

5. 現在前端**有 AI 畫框**的 MJPEG 路徑：

   - `/api/public/cameras/camera-01/stream` （相容原路徑，**行為變更：改成帶框**）
   - `/api/public/cameras/camera-01/ai.mjpg` （帶框）
   - `/api/public/cameras/camera-01/raw.mjpg` （無框、原始畫面）

   MediaMTX 輸出路徑預設 `rtsp://127.0.0.1:8554/camera01_ai`（第一台，可透過 `AI_PUBLISH_URL` 設定）、`rtsp://127.0.0.1:8554/camera02_ai`（第二台）。如果前端使用另一條 raw RTSP / HLS 路徑，此 ZIP **不包含前端程式**，請將前端改讀 AI 輸出，否則仍然不會有後端方框。

6. 到偵測 API 驗證同時含有 PPE / 人員：

   ```text
   GET /api/public/cameras/camera-01/detections
   ```

   注意 `data.detections[].className` 是模型原始值：`person`、`helmet`、`respirator`、`aluminized_gloves`。`data.people[].ppe` 是分析用：`helmet`、`respirator`、`glove`。`data.modelDetections` 可分辨是否真的收到 PPE 模型輸出：例如 `{"person":1,"ppe":3}`。

## 不開啟前端，直接診斷 best.pt 的 PPE 偵測

請準備一張能清楚看到安全帽、面具和手套的照片，在 `backend/` 目錄執行：

```bash
python diagnose_models.py --source path/to/test.jpg --ppe-confidence 0.20
```

或直接截取本機攝影機畫面（`0` 代表第一台裝置）：

```bash
python diagnose_models.py --source 0 --frames 20 --ppe-confidence 0.20
```

腳本會列出 Person + PPE 所有推論框，並建立 `debug_annotated.jpg`（本地檔案）。若 `ppe` 數量仍是 `0`：

```bash
python diagnose_models.py --source path/to/test.jpg --ppe-confidence 0.10 --ppe-imgsz 960
```

若調低門檻、放大 imgsz 後還是 0，原因更可能在模型訓練資料、影像域差異、物件太小或現場攝影機畫質，而非畫框或 API 程式。

## 測試

從 `backend/` 目錄執行：

```bash
python -m pytest -q
python -m compileall -q .
```

修正環境執行：**30 tests passed**，包含原本的 22 項測試與新增的 8 項測試。

**測試限制**：此修正環境缺少 `ultralytics` 套件且無法安裝，沒有實際攝影機／照片；以上是模型 pickle 結構「安全字串解析」、YOLO 輸出的模擬物件推論整合測試、真實 OpenCV 畫框與 JPEG 讀寫、API 路由及原回歸測試，不能宣稱模型已在現場實測辨識成功。

## 判斷 PPE 未穿戴的必要條件

此系統只含 Person 偵測與 3 類 PPE 模型（非手部/頭部可見性模型）。**偵測不到 PPE 並不等於使用者沒戴**。沒有姿態模型時，系統不會把看不見手部/面部等情況武斷判成違規。若要可靠區分「缺戴」與「遮擋、畫質不佳、漏偵」，需要另行加入適當 Pose 模型及現場驗證/資料集改進。
