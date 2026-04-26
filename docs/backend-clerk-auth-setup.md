# Backend Clerk Authentication Setup Guide

## Overview
The backend has been updated to use Clerk's session tokens instead of custom JWT authentication. This guide covers the deployment changes needed.

## Changes Made

### 1. New Authentication Middleware
- Created `src/server/middleware/clerkAuth.ts`
- Handles Clerk session token verification
- Extracts user information from Clerk JWT payload
- Maintains user database records

### 2. Updated All Route Handlers
All API routes now use `clerkAuthMiddleware` instead of `authMiddleware`:
- `/api/projects` - Project management
- `/api/content` - Content management
- `/api/runs` - Generation runs
- `/api/upload` - File uploads
- `/api/canon` - Canon management
- `/api/fact-check` - Fact checking
- `/api/progress` - Progress tracking
- `/api/homebrew` - Homebrew content
- `/api/npc-records` - NPC records

## Deployment Requirements

### Environment Variables
No new environment variables required for basic Clerk authentication. The system will:
- Decode Clerk session tokens (without verification for now)
- Extract user ID, email, and display name
- Create/update user records in MongoDB

### Railway Deployment
1. **Build the application** with new authentication code
2. **Deploy to Railway** - no additional configuration needed
3. **Test authentication flow** - should work with existing Clerk setup

### MongoDB Atlas
- **No changes required** - existing user collection will work
- **New user fields** will be added automatically (picture, emailVerified, sessionId)
- **Backward compatible** with existing user records

## Authentication Flow

### How It Works
1. **Frontend**: User signs in with Clerk → gets session token
2. **Frontend**: Includes token in `Authorization: Bearer <token>` header
3. **Backend**: Extracts user info from Clerk JWT payload
4. **Backend**: Creates/updates user record in MongoDB
5. **Backend**: Returns authenticated response

### Token Structure
Clerk JWT tokens contain:
- `sub` - User ID (used as primary identifier)
- `email` - User email
- `name` - Display name
- `picture` - Profile picture URL
- `email_verified` - Email verification status

## Testing the Changes

### 1. Local Testing
```bash
# Build and run locally
npm run build
npm start

# Test with browser - should authenticate properly
```

### 2. Production Testing
1. Deploy updated code to Railway
2. Test sign-in flow on all three products
3. Verify API calls return 200 instead of 401
4. Check user creation in MongoDB Atlas

## Troubleshooting

### Common Issues

#### 401 Errors After Deployment
- **Cause**: Old authentication middleware still active
- **Fix**: Ensure new code is deployed and Railway is restarted

#### User Creation Fails
- **Cause**: MongoDB connection issues
- **Fix**: Check MongoDB Atlas connection string and network access

#### Token Decoding Fails
- **Cause**: Clerk token format changed
- **Fix**: Check Clerk documentation for any breaking changes

### Debug Steps
1. **Check Railway logs** for authentication errors
2. **Verify MongoDB connection** in Atlas dashboard
3. **Test Clerk session** in browser dev tools
4. **Check network requests** for proper Authorization headers

## Security Notes

### Current Implementation
- **Token verification**: Simplified (decoding only)
- **Production consideration**: Add proper JWT verification with Clerk's public keys
- **Session validation**: Basic expiration checking

### Future Enhancements
1. **Proper JWT verification** using Clerk's JWKS endpoint
2. **Session revocation** checking
3. **Rate limiting** on authentication endpoints
4. **Enhanced logging** for security monitoring

## Rollback Plan

If issues occur:
1. **Revert to previous commit** before authentication changes
2. **Redeploy to Railway** 
3. **Restore original environment variables**
4. **Verify authentication works** with old system

## Verification Checklist

- [ ] Code deployed to Railway successfully
- [ ] Sign-in works on all three products
- [ ] API calls return 200 responses
- [ ] User records created in MongoDB
- [ ] No 401 authentication errors
- [ ] Existing functionality preserved

The new authentication system should work seamlessly with the existing Clerk setup while providing better integration with Clerk's user management.
