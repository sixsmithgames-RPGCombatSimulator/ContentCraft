# Minimal Vercel Deployment Setup

This guide shows the **minimal** configuration needed to deploy ContentCraft to Vercel for basic content creation features (copy/paste to AI).

## What Works Without MongoDB

✅ **ContentCraft Features** (copy/paste to AI workflow)
- Project management
- Content blocks and organization
- Fact-checking workflow
- All UI features for content creation

❌ **D&D Generator Features** (requires MongoDB Atlas setup)
- NPC generation
- Encounter creation
- Canon/Library features
- All D&D-specific generators

## Minimal Environment Variables

Set these in your Vercel project (Settings → Environment Variables):

### Required for Basic Deployment

```bash
NODE_ENV=production
CORS_ORIGIN=https://contentcraft.sixsmithgames.com
```

### Authentication (if using multi-tenant mode)

```bash
SINGLE_USER_MODE=true
DEFAULT_USER_ID=local-dev
JWT_SECRET=your-secure-random-secret
```

Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Optional: D&D Features (requires MongoDB Atlas)

Only set this if you want D&D Generator features:

```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dndgen?retryWrites=true&w=majority
```

## Deployment Steps

1. **Connect GitHub Repository to Vercel**
   - Import your repository in Vercel dashboard
   - Vercel will auto-detect the configuration

2. **Configure Environment Variables**
   - Go to Settings → Environment Variables
   - Add the minimal variables listed above
   - Set for "Production" environment

3. **Deploy**
   - Push to main branch
   - Vercel will automatically build and deploy

4. **Configure Custom Domain**
   - Go to Settings → Domains
   - Add `contentcraft.sixsmithgames.com`
   - Follow DNS configuration instructions
   - Update CORS_ORIGIN to match your domain

## Important Limitations on Vercel

### SQLite Not Available
- Vercel uses a read-only filesystem (serverless)
- SQLite databases cannot be created or written to
- ContentCraft features work in UI but **data is not persisted**
- Data is lost on each serverless function restart

### Solutions for Production

**Option 1: Use Alternative Hosting**
- Deploy to a VPS (DigitalOcean, AWS EC2, etc.)
- Use Docker deployment (see DOCKER.md)
- SQLite will work normally

**Option 2: Migrate to MongoDB**
- Move ContentCraft features from SQLite to MongoDB
- Requires code changes (future enhancement)
- Would allow full persistence on Vercel

**Option 3: Use Vercel for Demo Only**
- Perfect for showcasing the UI/UX
- Users can try features (data not saved)
- Note: Data resets on each cold start

## Current Recommendation

For production use with data persistence:

1. **Use Vercel for the demo/preview** at contentcraft.sixsmithgames.com
2. **Run production instance locally or on VPS** for actual content creation
3. **Or set up MongoDB Atlas** and migrate ContentCraft features to MongoDB

## Testing Your Deployment

1. Visit your Vercel URL
2. The app should load without errors
3. You can create projects and content (but they won't persist)
4. If you see errors, check Vercel function logs

## Troubleshooting

### App Loads but Features Don't Work
- This is expected - SQLite is disabled on Vercel
- Data won't persist between sessions
- UI will work, but saving fails silently

### 500 Errors on Load
- Check Vercel function logs
- Verify environment variables are set
- Ensure CORS_ORIGIN matches your domain

### MongoDB Connection Errors (if using D&D features)
- Verify MONGODB_URI is correct
- Check MongoDB Atlas allows connections from `0.0.0.0/0`
- Ensure connection string includes `retryWrites=true&w=majority`

## Next Steps

After minimal deployment:

1. **Set up custom domain** - contentcraft.sixsmithgames.com
2. **Decide on data persistence strategy**
   - Keep Vercel as demo only
   - Or deploy to VPS for production
3. **Optional: Set up MongoDB Atlas** for D&D features
