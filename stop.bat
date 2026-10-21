@echo off
setlocal
echo Stopping Safety System V2 windows...
taskkill /F /T /FI "WINDOWTITLE eq SafetyV2-Frontend" >nul 2>&1
taskkill /F /T /FI "WINDOWTITLE eq SafetyV2-FastAPI" >nul 2>&1
taskkill /F /T /FI "WINDOWTITLE eq SafetyV2-MediaMTX" >nul 2>&1
echo Stop commands sent.
pause
