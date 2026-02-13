@echo off
REM Docker Development Script
REM © 2025 Sixsmith Games. All rights reserved.

echo 🔧 Starting ContentCraft in development mode...
echo.

REM Check if .env exists
if not exist .env (
    echo ⚠️  .env file not found!
    echo 📝 Creating .env from .env.example...
    copy .env.example .env
    echo.
    echo ⚠️  IMPORTANT: Edit .env and set your API keys!
    echo.
    pause
)

REM Start development containers
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

echo.
echo ✅ Development environment started!
echo.
echo 🌐 Services:
echo   - Client: http://localhost:5173
echo   - Server: http://localhost:3000
echo   - MongoDB: localhost:27017
