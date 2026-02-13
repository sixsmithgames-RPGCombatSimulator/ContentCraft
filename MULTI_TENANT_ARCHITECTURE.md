# Multi-Tenant Architecture Plan

© 2025 Sixsmith Games. All rights reserved.

## Overview

ContentCraft is being upgraded from a single-user application to a multi-tenant SaaS application that integrates with a main authentication portal.

## Architecture

### Authentication Flow

```
User → Main Portal → Login/Signup → JWT Token → ContentCraft
                                                     ↓
                                            Verify Token
                                                     ↓
                                            Extract userId
                                                     ↓
                                         All queries filtered by userId
```

### Deployment Modes

#### Production Mode (Multi-Tenant)
```env
SINGLE_USER_MODE=false
AUTH_JWT_SECRET=shared_secret_with_main_portal
AUTH_JWT_ISSUER=https://yourmainportal.com
```

**Behavior:**
- Requires valid JWT token in Authorization header
- Extracts userId from token
- All database queries filtered by userId
- Users can only see their own data

#### Development Mode (Single-User)
```env
SINGLE_USER_MODE=true
DEFAULT_USER_ID=local-dev
```

**Behavior:**
- No authentication required
- All requests use DEFAULT_USER_ID
- Works exactly like current local version
- Existing data preserved and accessible

## Database Changes

### PostgreSQL Schema (replaces SQLite)

```sql
-- New users table (synced from main portal)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  metadata JSONB DEFAULT '{}'
);

-- Updated projects table
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Updated content_blocks table
CREATE TABLE content_blocks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES content_blocks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT,
  type TEXT NOT NULL,
  order_num INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for multi-tenant queries
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_content_blocks_user_id ON content_blocks(user_id);
CREATE INDEX idx_content_blocks_project_id ON content_blocks(project_id);
```

### MongoDB Schema Updates

All collections get a `userId` field:

```typescript
interface CanonEntity {
  _id: string;
  userId: string;  // ← NEW: owner of this entity
  type: string;
  canonical_name: string;
  // ... existing fields
}

interface GeneratedContent {
  _id: string;
  userId: string;  // ← NEW
  projectId?: string;
  // ... existing fields
}

interface NpcRecord {
  _id: string;
  userId: string;  // ← NEW
  // ... existing fields
}
```

**MongoDB Indexes:**
```javascript
db.canon_entities.createIndex({ userId: 1 });
db.generated_content.createIndex({ userId: 1 });
db.npc_records.createIndex({ userId: 1 });
db.canon_chunks.createIndex({ userId: 1 });
```

## Migration Strategy

### Phase 1: Preserve Existing Data

**Step 1:** Create default user for local development
```sql
INSERT INTO users (id, email, display_name)
VALUES ('local-dev', 'local@dev.local', 'Local Development User');
```

**Step 2:** Add user_id columns with default
```sql
-- SQLite migration (for local dev)
ALTER TABLE projects ADD COLUMN user_id TEXT DEFAULT 'local-dev' NOT NULL;
ALTER TABLE content_blocks ADD COLUMN user_id TEXT DEFAULT 'local-dev' NOT NULL;

-- Update existing rows explicitly
UPDATE projects SET user_id = 'local-dev' WHERE user_id IS NULL;
UPDATE content_blocks SET user_id = 'local-dev' WHERE user_id IS NULL;
```

**Step 3:** Migrate MongoDB data
```javascript
// Add userId to all existing documents
db.canon_entities.updateMany(
  { userId: { $exists: false } },
  { $set: { userId: 'local-dev' } }
);

db.generated_content.updateMany(
  { userId: { $exists: false } },
  { $set: { userId: 'local-dev' } }
);

// Repeat for all collections
```

### Phase 2: Enable Multi-Tenant Queries

All model classes updated to filter by userId:

```typescript
// Before (single-user)
static async findAll() {
  return await dbAll('SELECT * FROM projects');
}

// After (multi-tenant)
static async findAll(userId: string) {
  return await dbAll(
    'SELECT * FROM projects WHERE user_id = ?',
    [userId]
  );
}
```

## Authentication Middleware

### JWT Token Structure

Expected JWT payload from main portal:

```json
{
  "userId": "user_123456",
  "email": "user@example.com",
  "displayName": "John Doe",
  "iat": 1234567890,
  "exp": 1234571490,
  "iss": "https://yourmainportal.com"
}
```

### Middleware Implementation

```typescript
// src/server/middleware/auth.ts
export async function authMiddleware(req, res, next) {
  // Bypass in single-user mode
  if (process.env.SINGLE_USER_MODE === 'true') {
    req.userId = process.env.DEFAULT_USER_ID || 'local-dev';
    req.user = await ensureLocalUser(req.userId);
    return next();
  }

  // Production: verify JWT
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const payload = jwt.verify(token, process.env.AUTH_JWT_SECRET);
    req.userId = payload.userId;
    req.user = await ensureUser(payload);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

## Deployment Architecture

### Local Development
```yaml
# docker-compose.dev.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: contentcraft
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev

  mongodb:
    image: mongo:8.0

  app:
    environment:
      SINGLE_USER_MODE: "true"
      DEFAULT_USER_ID: "local-dev"
      DATABASE_URL: postgres://dev:dev@postgres:5432/contentcraft
      MONGO_URI: mongodb://mongodb:27017/contentcraft
```

### Production Deployment
```yaml
# docker-compose.yml (production)
services:
  app:
    environment:
      SINGLE_USER_MODE: "false"
      AUTH_JWT_SECRET: ${AUTH_JWT_SECRET}
      AUTH_JWT_ISSUER: ${AUTH_JWT_ISSUER}
      DATABASE_URL: ${DATABASE_URL}  # External PostgreSQL
      MONGO_URI: ${MONGO_URI}        # External MongoDB Atlas
```

## API Changes

### All endpoints require userId context

**Before:**
```typescript
// GET /api/projects
router.get('/', async (req, res) => {
  const projects = await ProjectModel.findAll();
  res.json(projects);
});
```

**After:**
```typescript
// GET /api/projects
router.get('/', authMiddleware, async (req, res) => {
  const projects = await ProjectModel.findAll(req.userId);
  res.json(projects);
});
```

### Resource Ownership Validation

```typescript
// GET /api/projects/:id
router.get('/:id', authMiddleware, async (req, res) => {
  const project = await ProjectModel.findById(req.params.id);

  // Verify ownership
  if (!project || project.userId !== req.userId) {
    return res.status(404).json({ error: 'Project not found' });
  }

  res.json(project);
});
```

## Configuration

### Environment Variables

```env
# Mode Configuration
SINGLE_USER_MODE=false           # true for local dev, false for production
DEFAULT_USER_ID=local-dev        # Used in single-user mode

# Authentication (Production)
AUTH_JWT_SECRET=shared_secret_with_portal
AUTH_JWT_ISSUER=https://yourmainportal.com
AUTH_JWT_AUDIENCE=contentcraft

# Database (Production)
DATABASE_URL=postgresql://user:pass@host:5432/contentcraft
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/contentcraft

# Database (Local Development)
DATABASE_URL=postgresql://dev:dev@localhost:5432/contentcraft
MONGO_URI=mongodb://localhost:27017/contentcraft
```

## Migration Checklist

### Step 1: Database Schema
- [ ] Add users table to PostgreSQL
- [ ] Add user_id to projects table
- [ ] Add user_id to content_blocks table
- [ ] Add user_id to fact_checks table
- [ ] Add user_id to sources table
- [ ] Add userId to MongoDB collections
- [ ] Create indexes for userId fields

### Step 2: Data Migration
- [ ] Create local-dev user
- [ ] Migrate existing SQLite data to PostgreSQL
- [ ] Assign all existing data to local-dev user
- [ ] Verify data integrity

### Step 3: Code Updates
- [ ] Create auth middleware
- [ ] Update all model methods to accept userId
- [ ] Update all routes to use authMiddleware
- [ ] Add ownership validation
- [ ] Update MongoDB queries to filter by userId

### Step 4: Testing
- [ ] Test local development mode
- [ ] Test production mode with mock JWT
- [ ] Test data isolation between users
- [ ] Test that local data still works

### Step 5: Deployment
- [ ] Set up PostgreSQL database (Neon, Railway, or Supabase)
- [ ] Set up MongoDB Atlas
- [ ] Deploy Docker container
- [ ] Configure environment variables
- [ ] Test with main portal integration

## Benefits

### For Local Development
- ✅ Existing data preserved
- ✅ No authentication required
- ✅ Works exactly as before
- ✅ Can use SQLite or PostgreSQL

### For Production
- ✅ True multi-tenancy
- ✅ Data isolation per user
- ✅ Scales to unlimited users
- ✅ Integrates with main portal
- ✅ Secure JWT-based auth

## Next Steps

1. Review and approve architecture
2. Create migration scripts
3. Implement auth middleware
4. Update all models for multi-tenancy
5. Test thoroughly in local mode
6. Deploy to production
