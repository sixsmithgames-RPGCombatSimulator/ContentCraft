#!/bin/bash
#
# Docker Build Script
# © 2025 Sixsmith Games. All rights reserved.
#

set -e

echo "🐳 Building ContentCraft Docker images..."

# Build production image
docker-compose build

echo "✅ Build complete!"
echo ""
echo "To start the application, run:"
echo "  docker-compose up -d"
