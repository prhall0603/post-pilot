@echo off
title PostPilot
cd /d "%~dp0"

echo.
echo  ┌─────────────────────────────────────────┐
echo  │  PostPilot — double-click installer     │
echo  └─────────────────────────────────────────┘
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  ❌ Node.js is not installed.
  echo     1. Open https://nodejs.org and install the LTS version ^(just click Next through the setup^)
  echo     2. Then double-click this file again.
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODEVER=%%v
echo  ✔ Node.js %NODEVER% found
echo.
echo  Installing everything and starting PostPilot…
echo  (first run takes a few minutes — just wait)
echo.

node install.mjs

echo.
echo  ────────────────────────────────────────────
echo  Server stopped. Double-click this file again to restart.
pause