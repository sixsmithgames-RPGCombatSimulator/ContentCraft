@echo off
REM Docker Stop Script
REM © 2025 Sixsmith Games. All rights reserved.

echo 🛑 Stopping ContentCraft...
echo.

docker-compose down

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Containers stopped!
    echo.
    echo 💾 Data volumes are preserved.
    echo 🗑️  To remove all data, run: docker-compose down -v
) else (
    echo.
    echo ❌ Failed to stop containers!
    exit /b 1
)
