# Vercel Environment Variables Setup

## Required Environment Variables for Each Product

Each product deployment needs its own Vercel project with specific environment variables.

### ContentCraft (contentcraft.sixsmithgames.com)
```bash
NODE_ENV=production
CORS_ORIGIN=https://contentcraft.sixsmithgames.com
MONGODB_URI=mongodb+srv://[username]:[password]@cluster.mongodb.net/contentcraft
DATABASE_URL=sqlite:./database.sqlite
```

### GameMasterCraft (gmcraft.sixsmithgames.com)
```bash
NODE_ENV=production
CORS_ORIGIN=https://gmcraft.sixsmithgames.com
MONGODB_URI=mongodb+srv://[username]:[password]@cluster.mongodb.net/gmcraft
DATABASE_URL=sqlite:./database.sqlite
```

### SagaCraft (sagacraft.sixsmithgames.com)
```bash
NODE_ENV=production
CORS_ORIGIN=https://sagacraft.sixsmithgames.com
MONGODB_URI=mongodb+srv://[username]:[password]@cluster.mongodb.net/sagacraft
DATABASE_URL=sqlite:./database.sqlite
```

## Optional Environment Variables

### Single User Mode (for testing)
```bash
SINGLE_USER_MODE=false
DEFAULT_USER_ID=local-dev
```

### Clerk Configuration (handled by frontend)
```bash
# These are NOT needed on Vercel backend
# Clerk configuration is handled in the frontend authentication guard
```

## Step-by-Step Setup

### 1. Create Separate Vercel Projects
Each product should have its own Vercel project:
- `contentcraft` → contentcraft.sixsmithgames.com
- `gmcraft` → gmcraft.sixsmithgames.com  
- `sagacraft` → sagacraft.sixsmithgames.com

### 2. Set Environment Variables
For each Vercel project:

1. Go to Vercel Dashboard
2. Select the project
3. Go to Settings → Environment Variables
4. Add the variables listed above

### 3. Verify MongoDB Setup
- Use the same MongoDB Atlas cluster for all projects
- Each can use the same database or separate databases
- Ensure MongoDB Atlas allows access from Vercel (0.0.0.0/0)

### 4. Deploy
1. Push code to GitHub
2. Vercel will auto-deploy
3. Check deployment logs for CORS debug messages

## Debugging

### Check Vercel Function Logs
Look for these messages:
```
🔍 CORS Debug - VERCEL_URL: [value], CORS_ORIGIN: [value]
✅ Using explicit CORS_ORIGIN: [value]
```

### Common Issues

**Wrong CORS_ORIGIN:**
- Must exactly match the domain
- Include https:// prefix
- No trailing slash

**MongoDB Connection:**
- Verify MONGODB_URI is correct
- Check Atlas network access
- Ensure username/password are correct

**Domain Not Pointing to Vercel:**
- Verify DNS settings
- Check custom domain configuration in Vercel

## Expected Results

After proper setup:
- ✅ Authentication works on all three products
- ✅ No more 401 errors
- ✅ Each product shows correct branding
- ✅ API calls return 200 responses
