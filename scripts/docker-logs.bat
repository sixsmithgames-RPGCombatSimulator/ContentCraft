@echo off
REM Docker Logs Script
REM © 2025 Sixsmith Games. All rights reserved.

set SERVICE=%1

if "%SERVICE%"=="" (
    echo 📋 Following logs for all services...
    echo Press Ctrl+C to exit
    echo.
    docker-compose logs -f
) else (
    echo 📋 Following logs for %SERVICE%...
    echo Press Ctrl+C to exit
    echo.
    docker-compose logs -f %SERVICE%
)
