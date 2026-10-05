@echo off
cd /d "%~dp0"
if not exist "out\main\index.js" call npm.cmd run build
if not exist "out\main\index.js" exit /b 1
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
