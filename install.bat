@echo off

echo Installing backend dependencies...
cd backend
python -m pip install -r requirements.txt

echo Installing frontend dependencies...
cd ..\frontend
npm.cmd install

echo Installation completed.
pause