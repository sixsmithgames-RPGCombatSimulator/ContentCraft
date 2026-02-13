#!/bin/bash
#
# Docker Logs Script
# © 2025 Sixsmith Games. All rights reserved.
#

# Default to following logs for all services
SERVICE=${1:-}

if [ -z "$SERVICE" ]; then
    echo "📋 Following logs for all services..."
    echo "Press Ctrl+C to exit"
    echo ""
    docker-compose logs -f
else
    echo "📋 Following logs for $SERVICE..."
    echo "Press Ctrl+C to exit"
    echo ""
    docker-compose logs -f $SERVICE
fi
