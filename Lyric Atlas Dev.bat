@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set "PROJECT_DIR=D:\a\applemusic-like-lyrics\Lyric-Atlas-API"
set "PID_FILE=%PROJECT_DIR%\.server.pid"

:menu
cls
echo.
echo  ========================================
echo    Lyric Atlas API - Server Manager
echo  ========================================
echo.

:: Check if server is running on ports 3000 or 8300
set "SERVER_RUNNING=0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING" 2^>nul') do (
    set "STORED_PID=%%a"
    set "SERVER_RUNNING=1"
)

if !SERVER_RUNNING! equ 1 (
    echo  [STATUS] Server is RUNNING ^(PID: !STORED_PID!^)
    echo.
    echo   1. Open Main API in browser
    echo   2. Open Cache Admin in browser
    echo   3. Stop server
    echo   4. Exit
    echo.
    set /p CHOICE="Select option (1-4): "
    
    if "!CHOICE!"=="1" start http://localhost:3000 && goto menu
    if "!CHOICE!"=="2" start http://localhost:8300 && goto menu
    if "!CHOICE!"=="3" goto stop_server
    if "!CHOICE!"=="4" exit /b 0
    goto menu
)

echo  [STATUS] Server is STOPPED
echo.
echo   1. Start server (foreground)
echo   2. Start server (background)
echo   3. Exit
echo.
set /p CHOICE="Select option (1-3): "

if "!CHOICE!"=="1" goto start_foreground
if "!CHOICE!"=="2" goto start_background
if "!CHOICE!"=="3" exit /b 0
goto menu

:stop_server
echo.
echo Stopping server...
taskkill /PID !STORED_PID! /F >nul 2>&1
if exist "%PID_FILE%" del "%PID_FILE%" >nul 2>&1
echo Server stopped.
timeout /t 2 >nul
goto menu

:start_foreground
cls
echo.
echo  ========================================
echo    Lyric Atlas API - Foreground Mode
echo  ========================================
echo.
echo  Main API:    http://localhost:3000
echo  Cache Admin: http://localhost:8300
echo.
echo  Press Ctrl+C to stop the server.
echo  ========================================
echo.

cd /d "%PROJECT_DIR%"
pnpm run dev
goto menu

:start_background
echo.
echo Starting server in background...

cd /d "%PROJECT_DIR%"

:: Create VBScript to run hidden
echo Set WshShell = CreateObject("WScript.Shell") > "%TEMP%\run_hidden.vbs"
echo WshShell.CurrentDirectory = "%PROJECT_DIR%" >> "%TEMP%\run_hidden.vbs"
echo WshShell.Run "cmd /c pnpm run dev", 0, False >> "%TEMP%\run_hidden.vbs"

:: Execute VBScript
cscript //nologo "%TEMP%\run_hidden.vbs"

:: Wait for server to start
timeout /t 4 >nul

:: Get PID from port
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING" 2^>nul') do (
    set NEW_PID=%%a
)

if defined NEW_PID (
    echo !NEW_PID! > "%PID_FILE%"
    echo.
    echo  [SUCCESS] Server started in background
    echo  PID:         !NEW_PID!
    echo  Main API:    http://localhost:3000
    echo  Cache Admin: http://localhost:8300
    echo.
    echo  Run this script again to manage the server.
) else (
    echo  [ERROR] Failed to start server
)

timeout /t 3 >nul
goto menu
