#!/bin/bash
#
# Docker Stop Script
# © 2025 Sixsmith Games. All rights reserved.
#

set -e

echo "🛑 Stopping ContentCraft..."

docker-compose down

echo "✅ Containers stopped!"
echo ""
echo "💾 Data volumes are preserved."
echo "🗑️  To remove all data, run: docker-compose down -v"
