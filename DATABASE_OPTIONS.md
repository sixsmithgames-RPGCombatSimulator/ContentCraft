# Database Options for ContentCraft

© 2025 Sixsmith Games. All rights reserved.

## Overview

ContentCraft supports two MongoDB deployment options:

1. **Built-in MongoDB Container** (Default) - Self-contained, no external hosting needed
2. **External Hosted MongoDB** (Optional) - Use Railway, MongoDB Atlas, DigitalOcean, etc.

## Option 1: Built-in MongoDB Container (Default) ✅ RECOMMENDED

### How It Works

When you run `docker-compose up -d`, Docker automatically starts **TWO containers**:

```
┌─────────────────────────────────────┐
│  Your Computer/Server               │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Container 1: MongoDB        │  │
│  │  - Runs MongoDB 8.0          │  │
│  │  - Data in Docker volume     │  │
│  │  - Auto-starts               │  │
│  │  - Persists across restarts  │  │
│  └──────────────────────────────┘  │
│               ↕                     │
│  ┌──────────────────────────────┐  │
│  │  Container 2: ContentCraft   │  │
│  │  - Client (React)            │  │
│  │  - Server (Node.js)          │  │
│  │  - Connects to MongoDB       │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Setup (Zero Configuration Required!)

**1. Start everything:**
```bash
# Windows
scripts\docker-start.bat

# Linux/Mac
./scripts/docker-start.sh

# Or directly
docker-compose up -d
```

**2. That's it!** MongoDB is running inside Docker automatically.

### What Happens

- MongoDB container starts first
- Waits for MongoDB to be healthy (health check)
- ContentCraft app starts and connects to MongoDB
- Data is stored in Docker volume `mongodb-data`
- Everything stays running until you stop it

### Verify It's Working

```bash
# Check both containers are running
docker-compose ps

# Should show:
# contentcraft-mongodb    Up (healthy)
# contentcraft-app        Up (healthy)

# View MongoDB logs
docker-compose logs mongodb

# Access MongoDB shell
docker-compose exec mongodb mongosh -u admin -p changeme
```

### Data Persistence

Your MongoDB data is stored in a **Docker volume** that persists even when containers are stopped:

```bash
# Stop containers (data is kept)
docker-compose down

# Start again (data is still there)
docker-compose up -d

# Remove containers AND data (WARNING: DELETES DATA!)
docker-compose down -v
```

### Pros & Cons

**Pros:**
- ✅ Zero configuration needed
- ✅ No external accounts required
- ✅ No monthly hosting costs
- ✅ Works offline
- ✅ Data stays on your machine
- ✅ Perfect for development and self-hosted production
- ✅ Fast (no network latency)
- ✅ Full control over database

**Cons:**
- ⚠️ Data is only on one machine (no built-in redundancy)
- ⚠️ You manage backups yourself
- ⚠️ Limited to single server (no automatic scaling)
- ⚠️ No built-in monitoring dashboard

**Best For:**
- Local development
- Self-hosted deployments
- Small to medium deployments
- When you want full control
- When you don't want monthly hosting costs

---

## Option 2: External Hosted MongoDB (Optional)

Use this if you want a managed database service like Railway, MongoDB Atlas, or DigitalOcean.

### Supported Services

- **MongoDB Atlas** (Official MongoDB hosting)
- **Railway** (Simple deployment platform)
- **DigitalOcean Managed MongoDB**
- **AWS DocumentDB**
- **Azure Cosmos DB**
- Any MongoDB-compatible service

### Setup

**1. Get MongoDB connection string from your hosting provider**

Examples:
```bash
# MongoDB Atlas
mongodb+srv://username:password@cluster.mongodb.net/dndgen?retryWrites=true&w=majority

# Railway
mongodb://mongo:password@containers-us-west-123.railway.app:6789

# DigitalOcean
mongodb://doadmin:password@db-mongodb-nyc1-12345.b.db.ondigitalocean.com:27017/dndgen?tls=true
```

**2. Update your `.env` file:**

```env
# Comment out or remove these (not needed)
# MONGO_ROOT_USERNAME=admin
# MONGO_ROOT_PASSWORD=changeme
# MONGO_DATABASE=dndgen

# Add your external MongoDB URI
MONGO_URI=mongodb+srv://username:password@your-cluster.mongodb.net/dndgen?retryWrites=true&w=majority
```

**3. Use the external database compose file:**

```bash
# Start with external database
docker-compose -f docker-compose.external-db.yml up -d

# Or create an alias for convenience
# Windows (in .env or script):
# set COMPOSE_FILE=docker-compose.external-db.yml

# Linux/Mac (in .bashrc):
# export COMPOSE_FILE=docker-compose.external-db.yml
```

**Alternative: Modify default docker-compose.yml**

Remove the MongoDB service entirely:

```yaml
# docker-compose.yml
services:
  # Remove or comment out this entire section:
  # mongodb:
  #   image: mongo:8.0
  #   ...

  app:
    # ... keep app service
    environment:
      MONGO_URI: ${MONGO_URI}  # Uses external database
    # Remove depends_on for mongodb since it doesn't exist
```

### Verification

```bash
# Check only app container is running
docker-compose ps

# Should show:
# contentcraft-app    Up (healthy)

# Check logs for MongoDB connection
docker-compose logs app | grep -i mongo

# Should see: "✅ Connected to MongoDB"
```

### Pros & Cons

**Pros:**
- ✅ Automatic backups
- ✅ Built-in redundancy/replication
- ✅ Monitoring dashboards
- ✅ Automatic scaling
- ✅ Professional support
- ✅ Multiple regions
- ✅ Managed security updates

**Cons:**
- ⚠️ Monthly hosting costs ($0-$50+)
- ⚠️ Requires internet connection
- ⚠️ Network latency (slower than local)
- ⚠️ Less control over database configuration
- ⚠️ Data stored on third-party servers

**Best For:**
- Production deployments requiring high availability
- Multi-region deployments
- When you want managed backups
- When you need professional support
- Teams that prefer not to manage infrastructure

---

## Configuration Reference

### Default Setup (.env with built-in MongoDB)

```env
# MongoDB Configuration (for built-in container)
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=your_secure_password_here
MONGO_DATABASE=dndgen
MONGO_PORT=27017

# Application
APP_PORT=3000
NODE_ENV=production
SESSION_SECRET=your_session_secret_here

# OpenAI
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4-turbo-preview
```

### External Database Setup (.env with hosted MongoDB)

```env
# External MongoDB URI (Railway, Atlas, etc.)
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/dndgen?retryWrites=true&w=majority

# Application
APP_PORT=3000
NODE_ENV=production
SESSION_SECRET=your_session_secret_here

# OpenAI
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4-turbo-preview
```

---

## Switching Between Options

### From Built-in to External

**1. Export your data:**
```bash
# Backup data from built-in MongoDB
docker-compose exec mongodb mongodump --out=/data/backup
docker cp contentcraft-mongodb:/data/backup ./mongodb-backup
```

**2. Import to external database:**
```bash
# Using mongorestore with external URI
mongorestore --uri="mongodb+srv://user:pass@cluster.mongodb.net/dndgen" ./mongodb-backup/dndgen
```

**3. Update docker-compose:**
```bash
# Use external database compose file
docker-compose -f docker-compose.external-db.yml up -d
```

### From External to Built-in

**1. Export from external database:**
```bash
# Dump from external MongoDB
mongodump --uri="mongodb+srv://user:pass@cluster.mongodb.net/dndgen" --out=./mongodb-backup
```

**2. Switch to built-in:**
```bash
# Start with built-in MongoDB
docker-compose up -d
```

**3. Import data:**
```bash
# Copy backup to container
docker cp ./mongodb-backup contentcraft-mongodb:/data/backup

# Restore
docker-compose exec mongodb mongorestore /data/backup
```

---

## Recommendations

### For Development
**Use:** Built-in MongoDB Container ✅
- No setup needed
- Fast iteration
- No costs
- Works offline

### For Small Production (1-10 users)
**Use:** Built-in MongoDB Container ✅
- Cost effective
- Sufficient reliability
- Just set up automated backups

### For Medium Production (10-100 users)
**Consider:** Either option
- Built-in if you manage backups and monitoring
- External if you want managed service

### For Large Production (100+ users)
**Use:** External Hosted MongoDB ✅
- Professional support
- Automatic scaling
- High availability
- Built-in monitoring

---

## Cost Comparison

### Built-in MongoDB Container
- **Monthly Cost**: $0 (included in server costs)
- **Server**: $5-20/month (DigitalOcean, Railway, etc.)
- **Backups**: $5/month (optional cloud storage)
- **Total**: $5-25/month

### External MongoDB
- **MongoDB Atlas Free**: $0 (512MB limit)
- **MongoDB Atlas Shared**: $9/month (2GB storage)
- **MongoDB Atlas Dedicated**: $57+/month (10GB+)
- **Railway**: $5-20/month (depending on usage)
- **Total**: $0-100+/month

---

## Quick Decision Guide

**Use Built-in MongoDB if:**
- ✅ You're just starting out
- ✅ You're developing locally
- ✅ You want to minimize costs
- ✅ You're comfortable managing backups
- ✅ Your app runs on a single server

**Use External MongoDB if:**
- ✅ You need high availability (99.95%+ uptime)
- ✅ You want automatic backups and point-in-time recovery
- ✅ You need multi-region replication
- ✅ You prefer managed services
- ✅ You have budget for hosting ($10+/month)
- ✅ You need professional support

---

## Summary

**The default ContentCraft Docker setup includes MongoDB - you DON'T need external hosting.**

When you run `docker-compose up -d`:
1. MongoDB container starts automatically
2. ContentCraft app container starts
3. They connect automatically
4. Data persists in Docker volumes
5. Everything just works!

**No Railway, Atlas, or other external database is required** unless you specifically want those features (managed backups, high availability, etc.).

---

**Need help?** See [DOCKER.md](./DOCKER.md) for detailed Docker documentation.
