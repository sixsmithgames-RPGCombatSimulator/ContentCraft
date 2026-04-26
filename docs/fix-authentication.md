# Authentication Fix for Multi-Brand Deployments

## Issue Summary
Both GameMasterCraft (gmcraft.sixsmithgames.com) and SagaCraft (sagacraft.sixsmithgames.com) are failing authentication due to:

1. **Clerk Subdomain Allowlist**: New domains not authorized
2. **API Authentication**: Backend rejecting requests with 401 errors

## 🚨 Immediate Actions Required

### 1. Fix Clerk Subdomain Allowlist

**Go to Clerk Dashboard → Configure → Domains**

Add these domains to your allowlist:
- `gmcraft.sixsmithgames.com`
- `sagacraft.sixsmithgames.com`
- `contentcraft.sixsmithgames.com` (if not already added)

**Steps:**
1. Login to Clerk Dashboard
2. Navigate to your application
3. Go to "Configure" → "Domains"
4. Click "Add Domain"
5. Add each subdomain above
6. Save configuration

### 2. Update CORS Configuration

The backend CORS needs to allow all product domains:

**For each Vercel deployment, set:**
```bash
# ContentCraft
CORS_ORIGIN=https://contentcraft.sixsmithgames.com

# GameMasterCraft  
CORS_ORIGIN=https://gmcraft.sixsmithgames.com

# SagaCraft
CORS_ORIGIN=https://sagacraft.sixsmithgames.com
```

### 3. Update Clerk Frontend Configuration

The current index.html has hardcoded references that need to be updated for each product:

#### For GameMasterCraft:
```html
<!-- Update in index.html -->
<script>
  var APP_SLUG = 'gamemastercraft';
  // ... rest of Clerk config
</script>
```

#### For SagaCraft:
```html
<!-- Update in index.html -->
<script>
  var APP_SLUG = 'sagacraft';
  // ... rest of Clerk config
</script>
```

## 🔧 Implementation Steps

### Step 1: Clerk Dashboard Configuration
1. **Login to Clerk Dashboard**
2. **Select your application**
3. **Navigate to Configure → Domains**
4. **Add all three domains:**
   - `contentcraft.sixsmithgames.com`
   - `gmcraft.sixsmithgames.com` 
   - `sagacraft.sixsmithgames.com`
5. **Save and wait for propagation**

### Step 2: Update Vercel Environment Variables

For each deployment, set the correct CORS origin:

**ContentCraft Deployment:**
```
CORS_ORIGIN=https://contentcraft.sixsmithgames.com
NEXT_PUBLIC_PRODUCT_KEY=contentcraft
```

**GameMasterCraft Deployment:**
```
CORS_ORIGIN=https://gmcraft.sixsmithgames.com
NEXT_PUBLIC_PRODUCT_KEY=gamemastercraft
```

**SagaCraft Deployment:**
```
CORS_ORIGIN=https://sagacraft.sixsmithgames.com
NEXT_PUBLIC_PRODUCT_KEY=sagacraft
```

### Step 3: Update Frontend Authentication Guard

The current auth guard in index.html needs to be product-aware. Create a dynamic version:

```html
<script>
  // Dynamic product detection for Clerk auth guard
  var hostname = window.location.hostname;
  var APP_SLUG = 'contentcraft'; // default
  
  if (hostname.includes('gamemastercraft')) {
    APP_SLUG = 'gamemastercraft';
  } else if (hostname.includes('sagacraft')) {
    APP_SLUG = 'sagacraft';
  }
  
  // Rest of Clerk configuration remains the same
  var PUBLISHABLE_KEY = 'pk_live_Y2xlcmsuc2l4c21pdGhnYW1lcy5jb20k';
  // ... rest of script
</script>
```

## 🎯 Expected Results

After these fixes:

1. ✅ Clerk authentication will work on all three domains
2. ✅ API calls will succeed (no more 401 errors)
3. ✅ Users can login and access their projects
4. ✅ Each product shows correct branding

## 🔍 Testing Checklist

- [ ] Clerk domains configured in dashboard
- [ ] CORS origins set correctly for each deployment
- [ ] Each deployment redeployed with new env vars
- [ ] Login works on all three domains
- [ ] API calls return 200 instead of 401
- [ ] Projects load correctly in dashboard

## 🚨 Error Messages Explained

### "Tracking Prevention blocked access to storage"
This is a browser security feature that blocks third-party cookies. It's cosmetic and doesn't affect functionality.

### "The request origin subdomain is not in the allowed subdomains list"
**Critical**: Clerk is rejecting the domain because it's not in the allowlist.

### "Failed to load resource: the server responded with a status of 401"
**Critical**: Backend API is rejecting requests due to CORS/authentication mismatch.

## 📞 Quick Debug Commands

```bash
# Test CORS configuration
curl -H "Origin: https://gmcraft.sixsmithgames.com" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: X-Requested-With" \
     -X OPTIONS \
     https://your-api-url.com/api/projects

# Test Clerk authentication
curl -I https://clerk.sixsmithgames.com/v1/client
```

The main issue is the Clerk domain allowlist. Once that's configured, most authentication errors should resolve.
