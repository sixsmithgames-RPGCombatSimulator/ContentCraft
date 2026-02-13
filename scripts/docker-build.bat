@echo off
REM Docker Build Script
REM © 2025 Sixsmith Games. All rights reserved.

echo 🐳 Building ContentCraft Docker images...
echo.

docker-compose build

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Build complete!
    echo.
    echo To start the application, run:
    echo   docker-compose up -d
) else (
    echo.
    echo ❌ Build failed!
    exit /b 1
)
