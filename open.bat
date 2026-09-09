@echo off
set "ROOT=%~dp0"

start "MediaMTX" cmd /k "cd /d "%ROOT%mediamtx" && mediamtx.exe mediamtx.yml"

timeout /t 2 /nobreak > nul

start "FastAPI Backend" cmd /k "cd /d "%ROOT%backend" && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 2 /nobreak > nul

start "React Frontend" cmd /k "cd /d "%ROOT%frontend" && npm.cmd run dev"

timeout /t 4 /nobreak > nul

start "" "http://localhost:5173"