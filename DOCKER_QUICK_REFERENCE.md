# Docker Quick Reference

© 2025 Sixsmith Games. All rights reserved.

## Quick Commands

### Start Application
```bash
# Windows
scripts\docker-start.bat

# Linux/Mac
./scripts/docker-start.sh

# Or directly
docker-compose up -d
```

### Stop Application
```bash
# Windows
scripts\docker-stop.bat

# Linux/Mac
./scripts/docker-stop.sh

# Or directly
docker-compose down
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f mongodb
```

### Development Mode
```bash
# Windows
scripts\docker-dev.bat

# Linux/Mac
./scripts/docker-dev.sh

# Or directly
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Build Images
```bash
# Build all
docker-compose build

# Build without cache
docker-compose build --no-cache

# Build specific service
docker-compose build app
```

### Container Management
```bash
# List running containers
docker-compose ps

# Restart containers
docker-compose restart

# Restart specific service
docker-compose restart app

# Stop containers (keep data)
docker-compose stop

# Remove containers and volumes (DELETE DATA!)
docker-compose down -v
```

### Access Container Shell
```bash
# App container
docker-compose exec app sh

# MongoDB shell
docker-compose exec mongodb mongosh -u admin -p changeme
```

### Database Operations
```bash
# Backup database
docker-compose exec mongodb mongodump --out=/data/backup

# Restore database
docker-compose exec mongodb mongorestore /data/backup

# Export collection
docker exec contentcraft-mongodb mongoexport \
  --db=dndgen \
  --collection=projects \
  --out=/tmp/projects.json
```

### Monitor Resources
```bash
# Real-time stats
docker stats

# Container resource usage
docker-compose top
```

### Troubleshooting
```bash
# Check container health
docker-compose ps

# Inspect container
docker inspect contentcraft-app

# View environment variables
docker-compose config

# Check logs for errors
docker-compose logs --tail=100 app

# Restart unhealthy container
docker-compose restart app
```

### Cleanup
```bash
# Remove stopped containers
docker container prune

# Remove unused images
docker image prune

# Remove unused volumes
docker volume prune

# Remove everything (CAREFUL!)
docker system prune -a --volumes
```

## Common Issues

### Port Already in Use
```bash
# Change port in .env
APP_PORT=3001

# Or find and kill process
# Windows:
netstat -ano | findstr :3000

# Linux/Mac:
lsof -i :3000
```

### Container Won't Start
```bash
# Check logs
docker-compose logs app

# Verify configuration
docker-compose config

# Rebuild from scratch
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### Database Connection Failed
```bash
# Verify MongoDB is running
docker-compose ps mongodb

# Check MongoDB logs
docker-compose logs mongodb

# Restart MongoDB
docker-compose restart mongodb

# Test connection
docker-compose exec app node -e \
  "require('mongodb').MongoClient.connect(process.env.MONGO_URI)"
```

### Out of Memory
```bash
# Check memory usage
docker stats

# Increase Docker memory in Docker Desktop
# Settings → Resources → Memory → Increase limit

# Or set limits in docker-compose.yml
```

### Permission Issues
```bash
# Reset volumes
docker-compose down
docker volume rm contentcraft_app-sessions contentcraft_app-uploads
docker-compose up -d
```

## Environment Variables

Create `.env` file with:

```env
# MongoDB
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=your_secure_password
MONGO_DATABASE=dndgen

# Application
APP_PORT=3000
NODE_ENV=production
SESSION_SECRET=your_session_secret

# OpenAI
OPENAI_API_KEY=sk-your-api-key
OPENAI_MODEL=gpt-4-turbo-preview
```

## Volumes

Persistent data volumes:
- `mongodb-data` - Database files
- `mongodb-config` - MongoDB configuration
- `app-sessions` - User sessions
- `app-uploads` - Uploaded files

```bash
# List volumes
docker volume ls | grep contentcraft

# Inspect volume
docker volume inspect contentcraft_mongodb-data

# Backup volume
docker run --rm \
  -v contentcraft_mongodb-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/mongodb-backup.tar.gz /data
```

## Networking

Default network: `contentcraft-network`

```bash
# Inspect network
docker network inspect contentcraft_contentcraft-network

# View container IPs
docker network inspect contentcraft_contentcraft-network \
  --format='{{range .Containers}}{{.Name}}: {{.IPv4Address}}{{"\n"}}{{end}}'
```

## Health Checks

Both services have health checks:

```bash
# Check app health
curl http://localhost:3000/api/health

# Check MongoDB health
docker-compose exec mongodb mongosh \
  --eval "db.adminCommand('ping')"

# View health status
docker-compose ps
```

## Updating Application

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose build
docker-compose up -d

# Verify update
docker-compose logs -f app
```

## Production Checklist

Before deploying to production:

- [ ] Set strong `MONGO_ROOT_PASSWORD`
- [ ] Set unique `SESSION_SECRET` (32+ chars)
- [ ] Set valid `OPENAI_API_KEY`
- [ ] Remove MongoDB port exposure (port 27017)
- [ ] Set up HTTPS reverse proxy
- [ ] Configure firewall rules
- [ ] Enable resource limits
- [ ] Set up log rotation
- [ ] Configure automated backups
- [ ] Test health checks
- [ ] Document recovery procedures

---

For detailed documentation, see [DOCKER.md](./DOCKER.md)
