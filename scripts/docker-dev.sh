#!/bin/bash
#
# Docker Development Script
# © 2025 Sixsmith Games. All rights reserved.
#

set -e

echo "🔧 Starting ContentCraft in development mode..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  IMPORTANT: Edit .env and set your API keys!"
    echo ""
    read -p "Press Enter to continue or Ctrl+C to cancel..."
fi

# Start development containers
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

echo ""
echo "✅ Development environment started!"
echo ""
echo "🌐 Services:"
echo "  - Client: http://localhost:5173"
echo "  - Server: http://localhost:3000"
echo "  - MongoDB: localhost:27017"
