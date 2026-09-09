backend/
│
├── main.py
│   FastAPI API / WebSocket
│
├── database.py
│   SQLite 歷史資料
│
├── state.py
│   DetectionState
│   儲存「即時」YOLO 結果
│
├── worker.py
│   不斷 Camera → YOLO
│
├── yolo_obj_detector.py
│   YOLO 模型與辨識
│
└── rtsp_cam.py
    攝影機讀取


1. frontend
   npm.cmd run dev
2. backend
   python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
3. mediamtx
   .\mediamtx.exe
