@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 24 from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
node -e "const [m,n]=process.versions.node.split('.').map(Number);if(m<24||(m===24&&n<5)){console.error('Please install Node.js 24.5 or newer.');process.exit(1)}"
if errorlevel 1 (
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing Terra dependencies...
  call npm ci
  if errorlevel 1 (
    echo Installation failed. Check your Internet connection and Node.js version.
    pause
    exit /b 1
  )
)
echo Open http://localhost:5173 in your browser. Keep this window open.
call npm run dev
pause
