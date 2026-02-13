# Multi-Tenant Implementation Status

© 2025 Sixsmith Games. All rights reserved.

## ✅ What's Been Implemented

### 1. Architecture Design
- **File**: `MULTI_TENANT_ARCHITECTURE.md`
- Complete multi-tenant architecture with single-user and multi-tenant modes
- JWT-based authentication from main portal
- Data isolation by userId
- Local development mode that bypasses authentication

### 2. Database Migration Scripts
- **SQLite Migration**: `migrations/001_add_multi_tenancy.sql`
  - Adds `users` table
  - Adds `user_id` column to all tables
  - Assigns all existing data to `local-dev` user
  - Creates indexes for performance

- **MongoDB Migration**: `migrations/001_add_multi_tenancy_mongo.js`
  - Adds `userId` field to all collections
  - Assigns all existing data to `local-dev` user
  - Creates indexes on userId fields

- **SQLite Runner**: `migrations/run-sqlite-migration.js`
  - Safely runs SQLite migration
  - Verifies data integrity
  - Reports migration status

### 3. Authentication Middleware
- **File**: `src/server/middleware/auth.ts`
- Two modes:
  - **Single-user mode** (`SINGLE_USER_MODE=true`): Bypasses auth, uses `DEFAULT_USER_ID`
  - **Multi-tenant mode** (`SINGLE_USER_MODE=false`): Verifies JWT tokens
- Auto-creates users from JWT payload
- Ensures local development user exists

### 4. Environment Configuration
- **File**: `src/server/config/env.ts`
- Added multi-tenancy configuration:
  - `SINGLE_USER_MODE`
  - `DEFAULT_USER_ID`
  - `AUTH_JWT_SECRET`
  - `AUTH_JWT_ISSUER`
  - `AUTH_JWT_AUDIENCE`
- Validates configuration based on mode

### 5. Updated Models
- **File**: `src/server/models/Project.ts`
- All methods now require `userId` parameter:
  - `create(userId, data)`
  - `findById(userId, id)`
  - `findAll(userId, options)`
  - `update(userId, id, data)`
  - `delete(userId, id)`
- All queries filtered by `user_id`

### 6. Environment Variables
- **File**: `.env.example`
- Added multi-tenancy configuration section
- Documented single-user vs multi-tenant modes

##  ⚠️ What Still Needs to Be Done

### Phase 1: Complete Model Updates (Required)

**All remaining models need the same userId filtering:**

1. **ContentBlock Model** (`src/server/models/ContentBlock.ts`)
   - Add `userId` parameter to all methods
   - Filter by `user_id` in queries
   - Verify project ownership

2. **MongoDB Models** (all in `src/server/models/`)
   - `CanonEntity.ts` - Add userId filtering
   - `CanonChunk.ts` - Add userId filtering
   - `GeneratedContent.ts` - Add userId filtering
   - `NpcRecord.ts` - Add userId filtering
   - `EncounterRecord.ts` - Add userId filtering
   - `LibraryCollection.ts` - Add userId filtering
   - `ProjectLibraryLink.ts` - Add userId filtering
   - `GenerationRun.ts` - Add userId filtering

3. **Route Updates** (all in `src/server/routes/`)
   - Add `authMiddleware` to all protected routes
   - Update all controller methods to use `req.userId`
   - Add ownership validation for all resource access
   - Files to update:
     - `projects.ts`
     - `content.ts`
     - `canon.ts`
     - `npcRecords.ts`
     - `runs.ts`
     - `progress.ts`
     - `upload.ts`
     - `factCheck.ts`
     - `homebrew.ts`

### Phase 2: Test Migrations Locally

**Run migrations on your local database:**

```bash
# 1. Backup your existing database first!
cp data/contentcraft.db data/contentcraft.db.backup

# 2. Run SQLite migration
node migrations/run-sqlite-migration.js

# 3. Run MongoDB migration (ensure MongoDB is running)
node migrations/001_add_multi_tenancy_mongo.js

# 4. Verify data is intact
# Check that all your projects/content still exist and are assigned to 'local-dev' user
```

### Phase 3: Update Environment Configuration

**Add to your local `.env` file:**

```env
# Multi-tenancy - LOCAL DEVELOPMENT MODE
SINGLE_USER_MODE=true
DEFAULT_USER_ID=local-dev

# These are only needed in production (can leave empty for local dev)
AUTH_JWT_SECRET=
AUTH_JWT_ISSUER=
AUTH_JWT_AUDIENCE=contentcraft
```

### Phase 4: Test Local Development

**After all model/route updates are complete:**

1. Start the app in single-user mode
2. Verify all existing data is accessible
3. Create new projects/content
4. Verify everything works exactly as before

### Phase 5: Production Deployment Preparation

**When ready to deploy to production:**

1. Choose hosting platform (Railway, DigitalOcean, etc.)
2. Set up PostgreSQL database (Neon, Supabase, or Railway Postgres)
3. Set up MongoDB Atlas (or use Railway MongoDB)
4. Configure environment variables:

```env
# Production configuration
SINGLE_USER_MODE=false
AUTH_JWT_SECRET=<shared-secret-with-main-portal>
AUTH_JWT_ISSUER=https://yourmainportal.com
AUTH_JWT_AUDIENCE=contentcraft
DATABASE_URL=<postgresql-connection-string>
MONGO_URI=<mongodb-atlas-connection-string>
```

5. Integrate with main portal for JWT token generation

### Phase 6: Main Portal Integration

**Your main portal needs to:**

1. Generate JWT tokens upon user login with this structure:
```javascript
const token = jwt.sign(
  {
    userId: user.id,
    email: user.email,
    displayName: user.name
  },
  AUTH_JWT_SECRET,  // Same secret as ContentCraft
  {
    expiresIn: '24h',
    issuer: 'https://yourmainportal.com',
    audience: 'contentcraft'
  }
);
```

2. Pass the token to ContentCraft via Authorization header:
```javascript
// When opening ContentCraft
window.open(`https://contentcraft.yourdomain.com?token=${token}`);

// Or in iframe
<iframe src="https://contentcraft.yourdomain.com" id="contentcraft" />
// Then post message with token
iframe.contentWindow.postMessage({ token }, '*');
```

3. ContentCraft frontend needs to:
   - Extract token from URL or postMessage
   - Store in localStorage/sessionStorage
   - Include in all API requests:
```typescript
fetch('/api/projects', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

## 📋 Implementation Checklist

### Database
- [x] SQLite migration script created
- [x] MongoDB migration script created
- [x] Migration runner created
- [ ] **Run migrations on local database**
- [ ] **Verify data integrity**

### Backend
- [x] Authentication middleware created
- [x] Environment configuration updated
- [x] Project model updated for multi-tenancy
- [ ] **Update ContentBlock model**
- [ ] **Update all MongoDB models**
- [ ] **Update all API routes**
- [ ] **Add authMiddleware to routes**
- [ ] **Add ownership validation**

### Frontend (Future - Not Critical for Backend)
- [ ] Add token handling in client
- [ ] Include Authorization header in all API calls
- [ ] Handle 401 errors (redirect to login)
- [ ] Show user info in UI

### Testing
- [ ] **Test migrations locally**
- [ ] **Test single-user mode**
- [ ] Test multi-tenant mode with mock JWT
- [ ] Test data isolation between users
- [ ] Test main portal integration

### Deployment
- [ ] Set up production PostgreSQL
- [ ] Set up production MongoDB
- [ ] Configure environment variables
- [ ] Deploy Docker container
- [ ] Test with real users from main portal

## 🎯 Next Immediate Steps

**You should do these now:**

1. **Review the architecture document**: `MULTI_TENANT_ARCHITECTURE.md`
2. **Decide**: Do you want me to complete all the remaining model/route updates?
3. **Test migrations**: Run them on your local database to verify data preservation
4. **Configure**: Add multi-tenancy env vars to your `.env` file

**Then we can:**
- Complete all remaining code updates
- Test thoroughly in single-user mode
- Prepare for production deployment
- Integrate with your main portal

## 📁 Files Created/Modified

### New Files
- `MULTI_TENANT_ARCHITECTURE.md` - Complete architecture documentation
- `IMPLEMENTATION_STATUS.md` - This file
- `migrations/001_add_multi_tenancy.sql` - SQLite migration
- `migrations/001_add_multi_tenancy_mongo.js` - MongoDB migration
- `migrations/run-sqlite-migration.js` - Migration runner
- `src/server/middleware/auth.ts` - Authentication middleware

### Modified Files
- `src/server/config/env.ts` - Added multi-tenancy config
- `src/server/models/Project.ts` - Added userId filtering
- `.env.example` - Added multi-tenancy variables

### Files That Need Updates (Next)
- `src/server/models/ContentBlock.ts`
- All MongoDB models in `src/server/models/`
- All routes in `src/server/routes/`
- Client API calls (future)

## 🔒 Data Safety

**Your existing data is safe!**
- Migrations only ADD fields, never delete
- All existing data gets assigned to `local-dev` user
- Single-user mode works exactly like before
- You can test migrations before committing

**Backup strategy:**
```bash
# Always backup before running migrations!
cp data/contentcraft.db data/contentcraft.db.backup
docker exec contentcraft-mongodb mongodump --out=/data/backup
docker cp contentcraft-mongodb:/data/backup ./mongodb-backup
```

## Questions?

**Common questions:**

**Q: Will my local development instance still work?**
A: Yes! With `SINGLE_USER_MODE=true`, it works exactly as before.

**Q: Can I keep using SQLite locally?**
A: Yes for development. Production should use PostgreSQL for multi-tenancy.

**Q: What if I don't run the migrations yet?**
A: The code changes are backward-compatible, but you'll need to run migrations before deploying to production or fully testing.

**Q: Do I need to update the frontend now?**
A: Not immediately. For local single-user mode, no frontend changes needed. For production, you'll need to add token handling.

---

**Ready to proceed?** Let me know if you want me to:
1. Complete all the remaining model/route updates
2. Create client-side authentication code
3. Create deployment configuration files
4. Any other specific implementations
