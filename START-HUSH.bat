@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Please install Node.js 24.5 or newer from https://nodejs.org
 pause
 exit /b 1
)
if not exist node_modules (
 call npm ci
 if errorlevel 1 (
  echo Installation failed. Check your internet connection and Node.js version.
  pause
  exit /b 1
 )
)
echo Open http://localhost:5173 in your browser after Vite is ready.
echo Keep this window open while using Hush.
call npm run dev
pause
