@echo off
setlocal
cd /d "%~dp0"
if not exist "dist\VoaDesk.exe" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "tools\build.ps1"
  if errorlevel 1 (
    echo Falha ao preparar o VoaDesk.
    pause
    exit /b 1
  )
)
start "" "dist\VoaDesk.exe"
