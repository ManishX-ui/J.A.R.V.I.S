@echo off
title J.A.R.V.I.S. Startup Manager
echo ===================================================
echo               J.A.R.V.I.S. SYSTEM STARTUP          
echo ===================================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/ and try again.
    pause
    exit /b 1
)

:: Check for Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python and try again.
    pause
    exit /b 1
)

echo [1/3] Starting J.A.R.V.I.S. Backend API Server...
cd backend
start "JARVIS Backend Server" cmd /k "npm start"
cd ..

echo.
echo [2/3] Starting J.A.R.V.I.S. Voice Service Daemon...
cd backend\voice
start "JARVIS Voice Daemon" cmd /k "python voice_service.py"
cd ..\..

echo.
echo [3/3] Starting J.A.R.V.I.S. Frontend Client...
cd frontend
start "JARVIS Frontend Client" cmd /k "npm run dev"
cd ..

echo.
echo ===================================================
echo     J.A.R.V.I.S. Core Services launched!
echo     Close the individual windows to terminate.
echo ===================================================
echo.
pause
