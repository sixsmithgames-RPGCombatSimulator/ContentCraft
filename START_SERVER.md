# Quick Start Guide

## Prerequisites

1. **Add your OpenAI API key to `.env`**:
   ```bash
   OPENAI_API_KEY=sk-your-actual-key-here
   ```

2. **Start MongoDB** (choose one):
   ```bash
   # Option A: Windows Service
   net start MongoDB

   # Option B: Docker
   docker run -d -p 27017:27017 --name mongodb mongo:latest
   ```

## Start the Server (Development Mode - Recommended)

```bash
npm run dev
```

This runs the TypeScript files directly without building, which is perfect for development!

## Bootstrap the Database (First Time Only)

In a **new terminal**:

```bash
npx tsx scripts/bootstrap.ts
```

## Test the API

```bash
# Health check
curl http://localhost:3001/api/health

# Create a test run
curl -X POST http://localhost:3001/api/runs \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"encounter\",\"prompt\":\"A dragon fight near Waterdeep\",\"flags\":{\"rule_base\":\"2024RAW\",\"allow_invention\":\"cosmetic\",\"mode\":\"GM\",\"tone\":\"epic\",\"difficulty\":\"deadly\",\"realism\":\"cinematic\"}}"

# Check run status (replace abc12345 with your runId)
curl http://localhost:3001/api/runs/abc12345
```

## For Production Build (If Needed)

The TypeScript build has some type conflicts with MongoDB. For now, use dev mode. If you need a production build, we can fix the types or use a different build approach.

**TL;DR: Just run `npm run dev` - it works perfectly!**
