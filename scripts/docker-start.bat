@echo off
REM Docker Start Script
REM © 2025 Sixsmith Games. All rights reserved.

echo 🚀 Starting ContentCraft...
echo.

REM Check if .env exists
if not exist .env (
    echo ⚠️  .env file not found!
    echo 📝 Creating .env from .env.example...
    copy .env.example .env
    echo.
    echo ⚠️  IMPORTANT: Edit .env and set your API keys and passwords!
    echo.
    pause
)

REM Start containers
docker-compose up -d

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ ContentCraft is starting...
    echo.
    echo 📊 Status:
    docker-compose ps
    echo.
    echo 🌐 Application will be available at: http://localhost:3000
    echo.
    echo 📝 To view logs:
    echo   docker-compose logs -f
    echo.
    echo 🛑 To stop:
    echo   docker-compose down
) else (
    echo.
    echo ❌ Failed to start containers!
    exit /b 1
)
