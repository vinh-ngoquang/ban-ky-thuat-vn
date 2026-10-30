@echo off
rem Cap nhat du lieu moi nhat roi mo dashboard trong trinh duyet.
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
"%USERPROFILE%\.venv-finlens\Scripts\python.exe" -W ignore update.py
if errorlevel 1 (
  echo.
  echo Cap nhat that bai. Kiem tra bien moi truong FINLENS_API_KEY va ket noi mang.
  pause
  exit /b 1
)
"%USERPROFILE%\.venv-finlens\Scripts\python.exe" serve.py
