@echo off
title PostPilot
node -v >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed.
  echo   1. Open https://nodejs.org and install the LTS version ^(click Next through setup^)
  echo   2. Reopen this file by double-clicking again.
  echo.
  pause
  exit /b 1
)
call install.bat