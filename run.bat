@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   Leave Request Workflow Engine
echo ===================================================
echo.

REM Determine the correct folder for leave-workflow
if exist "%~dp0leave-workflow\package.json" (
    cd /d "%~dp0leave-workflow"
) else if exist "%~dp0package.json" (
    cd /d "%~dp0"
) else (
    echo [ERROR] Could not find leave-workflow directory or package.json!
    pause
    exit /b 1
)

echo [1/4] Checking Node.js installation...
node -v >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH! Please install Node.js ^>= 20 LTS.
    pause
    exit /b 1
)
node -v

echo.
echo [2/4] Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm install failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/4] Seeding database with actors (emp-001, emp-002, mgr-001, hr-001)...
call npm run db:seed
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Database seeding failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [4/4] Starting server on http://localhost:3000 ...
echo.
echo ===================================================
echo   Server is running at: http://localhost:3000
echo   Press Ctrl+C to stop the server
echo ===================================================
echo.

call npm run dev
