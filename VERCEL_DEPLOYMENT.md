# Vercel Deployment Guide

## Prerequisites

- Vercel account connected to your GitHub repository
- MongoDB Atlas database (or accessible MongoDB instance)

## Build Configuration

The project is configured to build automatically on Vercel using the `vercel.json` configuration.

**Build Command:** `npm run build`
**Output Directory:** `dist`
**Install Command:** `npm install`

## Required Environment Variables

Set these in your Vercel project settings (Settings → Environment Variables):

### Required for Production

```
NODE_ENV=production
PORT=3001
```

### Database Configuration

```
DATABASE_PATH=./data/contentcraft.db
MONGODB_URI=your-mongodb-connection-string
```

For production, use MongoDB Atlas:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dndgen?retryWrites=true&w=majority
```

### API Keys

```
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o
```

Optional AI service keys:
```
ANTHROPIC_API_KEY=your-anthropic-key
GOOGLE_API_KEY=your-google-key
```

### Authentication

```
JWT_SECRET=your-secure-random-secret
SINGLE_USER_MODE=false
```

**Important:** Generate a strong JWT secret for production:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### CORS Configuration

```
CORS_ORIGIN=https://your-vercel-domain.vercel.app
```

Or allow your custom domain if you have one configured.

## Deployment Steps

1. **Connect Repository to Vercel**
   - Import your GitHub repository in Vercel dashboard
   - Select the repository

2. **Configure Environment Variables**
   - Go to Settings → Environment Variables
   - Add all required variables listed above
   - Set them for "Production" environment

3. **Deploy**
   - Push to your main branch
   - Vercel will automatically build and deploy
   - Monitor the deployment in the Vercel dashboard

4. **Verify Deployment**
   - Visit your Vercel URL
   - Check that the app loads without 404 errors
   - Test API endpoints at `https://your-domain.vercel.app/api/health`

## Local Development vs Production

### Local Development
```bash
npm run dev
```
- Uses `NODE_ENV=development` from `.env`
- Client runs on port 5173 (Vite dev server)
- Server runs on port 3001
- CORS enabled for localhost:5173

### Production (Vercel)
```bash
npm start
```
- Uses `NODE_ENV=production` from Vercel environment variables
- Client served as static files from `dist/client/`
- Server serves both client and API
- CORS configured for your Vercel domain

## Troubleshooting

### 404 Errors on Vercel

**Problem:** App shows 404 errors for index.html or static assets

**Solutions:**
1. Verify `NODE_ENV=production` is set in Vercel environment variables
2. Check that build completed successfully in Vercel deployment logs
3. Ensure `dist/client/` directory exists after build
4. Check `vercel.json` routes configuration

### Database Connection Issues

**Problem:** Can't connect to MongoDB on Vercel

**Solutions:**
1. Use MongoDB Atlas for cloud-hosted database
2. Whitelist Vercel IP addresses in MongoDB Atlas (or allow all: 0.0.0.0/0)
3. Verify `MONGODB_URI` is correctly set in Vercel environment variables
4. Check connection string format includes `retryWrites=true&w=majority`

### API Routes Not Working

**Problem:** API endpoints return 404 or 500 errors

**Solutions:**
1. Check Vercel function logs for errors
2. Verify all routes in `vercel.json` are correct
3. Ensure environment variables are set for production environment
4. Check that server code doesn't reference local file paths

## Build Process

The build process runs these steps:

1. `npm run build:server` - Compiles TypeScript server code to `dist/server/`
2. `npm run build:client` - Builds React client to `client/dist/`
3. `npm run copy:client` - Copies `client/dist/` to `dist/client/`

Result: Complete production build in `dist/` directory ready for Vercel.

## Custom Domain Setup

1. Add custom domain in Vercel project settings
2. Configure DNS records as instructed by Vercel
3. Update `CORS_ORIGIN` environment variable to your custom domain
4. Redeploy to apply changes
