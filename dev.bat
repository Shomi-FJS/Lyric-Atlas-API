@echo off
chcp 65001 >nul
title Lyric Atlas API - Dev Server

echo ========================================
echo   Lyric Atlas API - Development Server
echo ========================================
echo.

cd /d "%~dp0"

if not exist ".env" (
    echo [ERROR] .env file not found!
    echo Please create .env file first.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    pnpm install
    echo.
)

echo [INFO] Starting development server...
echo [INFO] Main API: http://localhost:3000
echo [INFO] Cache Admin: http://localhost:8300
echo.
echo Press Ctrl+C to stop the server.
echo ========================================
echo.

pnpm run dev
