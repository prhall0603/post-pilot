@echo off
setlocal
title PostPilot install
cd /d "%~dp0"

echo.
echo   -----------------------------------------
echo   PostPilot install + run  (Windows)
echo   -----------------------------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed.
  echo   Install Node 20+ from https://nodejs.org then reopen this file.
  echo.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo   Node.js %%v OK

if not exist package.json (
  if exist post-pilot\package.json (
    cd post-pilot
  ) else (
    echo   Cloning PostPilot from GitHub...
    git clone https://github.com/prhall0603/post-pilot.git post-pilot
    if errorlevel 1 (
      echo   Clone failed. Usually the repo is private: use 'gh auth login' once,
      echo   or make it public: GitHub - Settings - Danger Zone - Change visibility.
      pause
      exit /b 1
    )
    cd post-pilot
  )
)

echo   Installing all dependencies -- first run may take a few minutes...
npx -y pnpm@latest install
if errorlevel 1 (
  echo   Install failed - see output above.
  pause
  exit /b 1
)
echo   Dependencies installed OK

if not exist .env.local (
  echo DATABASE_URL=""> .env.local
)
findstr /c:"DATABASE_URL=\"postgresql" .env.local >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Press Enter to keep data on this computer (Local Mode - no accounts),
  set /p DB_URL=  or paste a Supabase connection string to store data in the cloud:
  call :saveenv "%DB_URL%"
)

node start-app.mjs
goto :eof

:saveenv
set DB_URL=%~1
if "%DB_URL%"=="" goto :eof
powershell -NoProfile -Command "$c='%~1'; $p=Get-Content .env.local -Raw; $p=$p -replace '(?m)^DATABASE_URL=.*$', ('DATABASE_URL=\"' + $c + '\"'); Set-Content .env.local $p"
findstr /c:"DATABASE_URL=\"postgresql" .env.local >nul 2>nul
if errorlevel 1 goto :eof
echo   DATABASE_URL saved to .env.local OK
goto :eof