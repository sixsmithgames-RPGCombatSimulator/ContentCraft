# Docker Deployment Guide

© 2025 Sixsmith Games. All rights reserved.

## Overview

ContentCraft is fully containerized using Docker and Docker Compose. This guide covers both production and development deployments.

## Architecture

The application consists of three main services:

1. **MongoDB** - Database (port 27017)
2. **ContentCraft App** - Combined client + server (port 3000)
   - React frontend (served as static files)
   - Node.js/Express backend API

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- At least 2GB RAM available for containers
- OpenAI API key (for AI features)

## Quick Start (Production)

### 1. Configure Environment

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` and set:
- `MONGO_ROOT_PASSWORD` - Secure MongoDB password
- `OPENAI_API_KEY` - Your OpenAI API key
- `SESSION_SECRET` - Random secure string for sessions

### 2. Build and Start

```bash
# Build images and start containers
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

### 3. Access Application

- **Application**: http://localhost:3000
- **MongoDB**: localhost:27017

### 4. Stop Application

```bash
# Stop containers
docker-compose down

# Stop and remove all data (WARNING: Deletes database!)
docker-compose down -v
```

## Development Setup

For development with hot reload:

### 1. Start Development Environment

```bash
# Start development containers
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Or in detached mode
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### 2. Access Services

- **Client (Vite Dev Server)**: http://localhost:5173
- **Server API**: http://localhost:3000
- **MongoDB**: localhost:27017

### 3. Development Features

- ✅ **Hot Module Replacement (HMR)** - Client changes reload instantly
- ✅ **Server Auto-restart** - Server restarts on code changes
- ✅ **Source Maps** - Full debugging support
- ✅ **Volume Mounts** - Code changes reflected immediately

## Docker Commands

### Container Management

```bash
# Start containers
docker-compose up -d

# Stop containers
docker-compose stop

# Restart containers
docker-compose restart

# Remove containers
docker-compose down

# Remove containers and volumes
docker-compose down -v
```

### Logs and Debugging

```bash
# View all logs
docker-compose logs

# Follow logs (live)
docker-compose logs -f

# View specific service logs
docker-compose logs app
docker-compose logs mongodb

# View last 100 lines
docker-compose logs --tail=100
```

### Building and Rebuilding

```bash
# Build images
docker-compose build

# Build without cache
docker-compose build --no-cache

# Rebuild specific service
docker-compose build app

# Build and start
docker-compose up --build
```

### Accessing Containers

```bash
# Execute command in running container
docker-compose exec app sh

# Execute command in MongoDB
docker-compose exec mongodb mongosh

# Run one-off command
docker-compose run app node --version
```

### Database Management

```bash
# MongoDB shell
docker-compose exec mongodb mongosh -u admin -p changeme

# Backup database
docker-compose exec mongodb mongodump --out=/data/backup

# Restore database
docker-compose exec mongodb mongorestore /data/backup

# Export data
docker exec contentcraft-mongodb mongoexport --db=dndgen --collection=projects --out=/tmp/projects.json
```

## Volume Management

### Persistent Data

The following volumes persist data across container restarts:

- `mongodb-data` - MongoDB database files
- `mongodb-config` - MongoDB configuration
- `app-sessions` - User session data
- `app-uploads` - Uploaded files

### Volume Commands

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect contentcraft_mongodb-data

# Backup volume (example)
docker run --rm -v contentcraft_mongodb-data:/data -v $(pwd):/backup alpine tar czf /backup/mongodb-backup.tar.gz /data

# Restore volume (example)
docker run --rm -v contentcraft_mongodb-data:/data -v $(pwd):/backup alpine tar xzf /backup/mongodb-backup.tar.gz -C /
```

## Production Deployment

### Security Checklist

Before deploying to production:

- [ ] Change `MONGO_ROOT_PASSWORD` to a strong password
- [ ] Set unique `SESSION_SECRET` (minimum 32 characters)
- [ ] Use HTTPS with reverse proxy (nginx/Traefik)
- [ ] Restrict MongoDB port (remove from docker-compose.yml)
- [ ] Configure firewall rules
- [ ] Enable MongoDB authentication
- [ ] Set up regular backups
- [ ] Configure log rotation
- [ ] Set resource limits

### Recommended Production Setup

```yaml
# Add to docker-compose.yml for production
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 512M
    restart: always
```

### Using with Reverse Proxy (nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `MONGO_ROOT_PASSWORD` | MongoDB admin password | `securepass123` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_ROOT_USERNAME` | `admin` | MongoDB admin username |
| `MONGO_DATABASE` | `dndgen` | Database name |
| `MONGO_PORT` | `27017` | MongoDB port |
| `APP_PORT` | `3000` | Application port |
| `OPENAI_MODEL` | `gpt-4-turbo-preview` | OpenAI model |
| `SESSION_SECRET` | (generated) | Session encryption key |
| `MAX_CONTENT_LENGTH` | `100000` | Max content size |

## Health Checks

Both the app and MongoDB have built-in health checks:

```bash
# Check app health
curl http://localhost:3000/api/health

# Check container health status
docker-compose ps
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs app

# Check MongoDB logs
docker-compose logs mongodb

# Verify environment variables
docker-compose config
```

### Database Connection Issues

```bash
# Test MongoDB connection
docker-compose exec app node -e "require('mongodb').MongoClient.connect(process.env.MONGO_URI).then(() => console.log('Connected')).catch(e => console.error(e))"

# Check MongoDB is running
docker-compose exec mongodb mongosh --eval "db.adminCommand('ping')"
```

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Change port in .env
APP_PORT=3001
```

### Out of Memory

```bash
# Check container memory usage
docker stats

# Increase Docker memory limit in Docker Desktop settings
# Or add resource limits in docker-compose.yml
```

### Permission Issues

```bash
# Fix volume permissions
docker-compose down
docker volume rm contentcraft_app-sessions contentcraft_app-uploads
docker-compose up -d
```

## Updating the Application

### Update to Latest Version

```bash
# Pull latest changes
git pull

# Rebuild images
docker-compose build

# Restart with new images
docker-compose up -d

# View logs to verify
docker-compose logs -f app
```

### Zero-Downtime Updates (Production)

```bash
# Build new image
docker-compose build app

# Create new container without stopping old one
docker-compose up -d --no-deps --scale app=2 app

# Wait for health check
sleep 30

# Stop old container
docker-compose up -d --no-deps --scale app=1 app
```

## Backup and Restore

### Database Backup

```bash
# Automated backup script
docker-compose exec mongodb mongodump --out=/data/backup/$(date +%Y%m%d)

# Copy to host
docker cp contentcraft-mongodb:/data/backup/$(date +%Y%m%d) ./backups/
```

### Database Restore

```bash
# Copy backup to container
docker cp ./backups/20250211 contentcraft-mongodb:/data/backup/

# Restore
docker-compose exec mongodb mongorestore /data/backup/20250211
```

## Performance Tuning

### MongoDB Optimization

```yaml
# Add to docker-compose.yml
mongodb:
  command: mongod --wiredTigerCacheSizeGB 1.5
```

### Application Optimization

```yaml
app:
  environment:
    NODE_OPTIONS: "--max-old-space-size=2048"
```

## Monitoring

### Container Stats

```bash
# Real-time stats
docker stats

# Prometheus metrics (if configured)
curl http://localhost:3000/metrics
```

### Log Aggregation

For production, consider using:
- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Graylog**
- **Splunk**

## Support

For issues or questions:
- Check logs: `docker-compose logs -f`
- Review this documentation
- Contact: Sixsmith Games

---

**Last Updated**: February 2025
**Docker Version**: 20.10+
**Docker Compose Version**: 2.0+
