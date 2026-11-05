@echo off
setlocal
cd /d "%~dp0"
if not exist "dist\VoaDeskCliente.exe" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "tools\build.ps1"
  if errorlevel 1 exit /b 1
)
start "" "dist\VoaDeskCliente.exe"
