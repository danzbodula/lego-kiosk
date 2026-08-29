@echo off
title DPT Kiosk - local server
cd /d "%~dp0"
py serve.py
pause
