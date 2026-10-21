@echo off
cd /d "%~dp0"
echo Installing backend requirements...
python -m pip install -r backendequirements.txt
if errorlevel 1 goto fail
cd frontend
echo Installing frontend dependencies...
call npm ci
if errorlevel 1 goto fail
cd ..
echo Please copy .env.example to .env and configure a secure password and camera.
pause
exit /b 0
:fail
echo Installation failed. Check Python, CUDA and npm.
pause
exit /b 1
