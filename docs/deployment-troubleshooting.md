# SagaCraft Deployment Troubleshooting Guide

## Issue: ERR_CONNECTION_CLOSED on sagacraft.sixsmithgames.com

This error indicates the server is actively rejecting connections before they're fully established. Based on our diagnostic, here are the likely causes and solutions:

## 🚨 Immediate Action Required

### 1. Missing Production Environment Variables
The deployment is missing critical environment variables for SagaCraft:

**Required Environment Variables:**
```bash
NODE_ENV=production
NEXT_PUBLIC_PRODUCT_KEY=sagacraft
NEXT_PUBLIC_PRODUCT_NAME=SagaCraft
NEXT_PUBLIC_CANONICAL_APP_URL=https://sagacraft.sixsmithgames.com
CORS_ORIGIN=https://sagacraft.sixsmithgames.com
PORT=3001
```

### 2. CORS Configuration Issue
The current CORS is set to `http://localhost:5173`, but production needs:
```bash
CORS_ORIGIN=https://sagacraft.sixsmithgames.com
```

## 🔧 Step-by-Step Fix

### Step 1: Configure Vercel Environment Variables
1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add the following variables:

| Name | Value | Environment |
|------|-------|-------------|
| `NODE_ENV` | `production` | Production |
| `NEXT_PUBLIC_PRODUCT_KEY` | `sagacraft` | Production |
| `NEXT_PUBLIC_PRODUCT_NAME` | `SagaCraft` | Production |
| `NEXT_PUBLIC_CANONICAL_APP_URL` | `https://sagacraft.sixsmithgames.com` | Production |
| `CORS_ORIGIN` | `https://sagacraft.sixsmithgames.com` | Production |
| `PORT` | `3001` | Production |

### Step 2: Redeploy the Application
1. Trigger a new deployment in Vercel
2. Wait for deployment to complete
3. Test the domain again

### Step 3: Verify Domain Configuration
Ensure DNS is properly configured:
```bash
# Check DNS resolution
nslookup sagacraft.sixsmithgames.com

# Check SSL certificate
openssl s_client -connect sagacraft.sixsmithgames.com:443

# Test HTTP headers
curl -I https://sagacraft.sixsmithgames.com
```

## 🔍 Additional Troubleshooting

### Check Server Logs
In Vercel dashboard:
1. Go to the Functions tab
2. Check logs for errors during startup
3. Look for messages about missing environment variables

### Test Product Configuration
The application should automatically detect SagaCraft based on:
1. Environment variable `NEXT_PUBLIC_PRODUCT_KEY=sagacraft`
2. Hostname `sagacraft.sixsmithgames.com`
3. Fallback to `contentcraft` if neither is set

### Verify Build Process
Ensure the latest code is deployed:
```bash
# Locally verify build works
npm run build
npm start

# Test with SagaCraft environment
NEXT_PUBLIC_PRODUCT_KEY=sagacraft npm start
```

## 🎯 Expected Behavior

Once configured correctly, visiting `https://sagacraft.sixsmithgames.com` should:

1. ✅ Load the SagaCraft branded interface
2. ✅ Show "SagaCraft" in the navbar instead of "ContentCraft"
3. ✅ Use emerald green theme colors
4. ✅ Display SagaCraft-specific SEO metadata
5. ✅ Create workspaces with `productKey: "sagacraft"`

## 🚀 Testing Checklist

- [ ] Environment variables configured in Vercel
- [ ] Application redeployed successfully
- [ ] Domain resolves to correct IP
- [ ] SSL certificate is valid
- [ ] Page loads without ERR_CONNECTION_CLOSED
- [ ] Correct branding displays (SagaCraft, not ContentCraft)
- [ ] Theme colors are emerald green
- [ ] SEO metadata shows SagaCraft information

## 🆘 If Issues Persist

1. **Check Vercel Function Logs**: Look for startup errors
2. **Verify Database Connection**: Ensure MongoDB is accessible
3. **Test Alternative Domain**: Try IP address directly
4. **Check Firewall Rules**: Ensure port 443 is open
5. **Contact Vercel Support**: If all configuration is correct

## 📞 Quick Commands for Debugging

```bash
# Test basic connectivity
curl -v https://sagacraft.sixsmithgames.com

# Check DNS
dig sagacraft.sixsmithgames.com

# Test with specific headers
curl -H "Host: sagacraft.sixsmithgames.com" https://your-server-ip

# Check SSL certificate details
openssl s_client -connect sagacraft.sixsmithgames.com:443 -servername sagacraft.sixsmithgames.com
```

The most likely fix is configuring the correct environment variables in your hosting platform and redeploying.
