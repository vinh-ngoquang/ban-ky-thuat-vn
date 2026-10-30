@echo off
rem Mo dashboard voi du lieu hien co, khong tai them.
chcp 65001 >nul
cd /d "%~dp0"
"%USERPROFILE%\.venv-finlens\Scripts\python.exe" serve.py
