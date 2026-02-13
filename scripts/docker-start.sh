#!/bin/bash
#
# Docker Start Script
# © 2025 Sixsmith Games. All rights reserved.
#

set -e

echo "🚀 Starting ContentCraft..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  IMPORTANT: Edit .env and set your API keys and passwords!"
    echo ""
    read -p "Press Enter to continue or Ctrl+C to cancel..."
fi

# Start containers
docker-compose up -d

echo ""
echo "✅ ContentCraft is starting..."
echo ""
echo "📊 Status:"
docker-compose ps

echo ""
echo "🌐 Application will be available at: http://localhost:3000"
echo ""
echo "📝 To view logs:"
echo "  docker-compose logs -f"
echo ""
echo "🛑 To stop:"
echo "  docker-compose down"
