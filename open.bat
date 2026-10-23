@echo off
setlocal
set "ROOT=%~dp0"

if not exist "%ROOT%mediamtx\mediamtx.exe" goto missing_media
if not exist "%ROOT%backend\main.py" goto missing_backend
if not exist "%ROOT%frontend\package.json" goto missing_frontend
if not exist "%ROOT%.env" goto missing_env
where python >nul 2>&1
if errorlevel 1 goto missing_python
where npm >nul 2>&1
if errorlevel 1 goto missing_npm

start "SafetyV2-MediaMTX" /D "%ROOT%mediamtx" cmd.exe /k "title SafetyV2-MediaMTX & mediamtx.exe mediamtx.yml"
timeout /t 2 /nobreak >nul
start "SafetyV2-FastAPI" /D "%ROOT%backend" cmd.exe /k "title SafetyV2-FastAPI & python -m uvicorn main:app --host 0.0.0.0 --port 8000"
timeout /t 2 /nobreak >nul
rem Other devices load the packed build (one gzip file) much faster than the dev
rem server (200+ unpacked modules). If the build fails, fall back to dev mode.
start "SafetyV2-Frontend" /D "%ROOT%frontend" cmd.exe /k "title SafetyV2-Frontend & npm.cmd run build & if errorlevel 1 (echo Build failed, using dev server & npm.cmd run dev -- --host 0.0.0.0 --port 5173) else (npm.cmd run preview -- --host 0.0.0.0 --port 5173 --strictPort)"
set /a WAITED=0
:wait_frontend
timeout /t 1 /nobreak >nul
set /a WAITED+=1
netstat -an | find ":5173 " | find "LISTENING" >nul
if errorlevel 1 if %WAITED% LSS 90 goto wait_frontend
start "" "http://localhost:5173"
exit /b 0

:missing_media
echo Missing mediamtx\mediamtx.exe
 goto error
:missing_backend
echo Missing backend\main.py
 goto error
:missing_frontend
echo Missing frontend\package.json
 goto error
:missing_env
echo Missing .env file. Copy .env.example to .env and configure it.
 goto error
:missing_python
echo Python not found. Check: python --version
 goto error
:missing_npm
echo npm not found. Check: npm -v
 goto error
:error
pause
exit /b 1
