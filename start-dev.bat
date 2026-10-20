@echo off
rem Starts The Last Gate locally at http://127.0.0.1:4173 (close this window to stop it).
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install Node 22 LTS from https://nodejs.org and run this again. & pause & exit /b 1)
node -v
if not exist node_modules (
  echo Installing dependencies, this takes a minute the first time...
  call npm install
)
call npm run dev
pause
