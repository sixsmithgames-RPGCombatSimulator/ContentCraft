#!/usr/bin/env node

/**
 * Vercel Authentication Debug Script
 * Helps diagnose why authentication is failing on Vercel deployment
 */

console.log('🔍 Vercel Authentication Debug\n');

console.log('📋 Current Status:');
console.log('✅ Fixed authentication middleware created (clerkAuthFixed.ts)');
console.log('✅ All routes updated to use fixed middleware');
console.log('✅ Build completed successfully');
console.log('✅ Code pushed to repository');
console.log('✅ Vercel environment variables configured');
console.log('❌ Still getting 401 errors after Vercel deployment');
console.log('');

console.log('🔍 Possible Issues:');
console.log('');

console.log('1. 📦 BUILD CACHE ISSUE');
console.log('   - Vercel might be using cached build');
console.log('   - New authentication code not deployed');
console.log('   - Solution: Force rebuild on Vercel');
console.log('');

console.log('2. 🔄 MIDDLEWARE IMPORT ISSUE');
console.log('   - Routes importing wrong middleware');
console.log('   - Old authentication still active');
console.log('   - Check: Build output includes clerkAuthFixed.js');
console.log('');

console.log('3. 🌧️ MONGODB CONNECTION ISSUE');
console.log('   - MongoDB not connecting on Vercel');
console.log('   - User creation failing');
console.log('   - Check: Vercel function logs');
console.log('');

console.log('4. 🔐 TOKEN FORMAT ISSUE');
console.log('   - Clerk tokens not in expected format');
console.log('   - jwt.decode() failing');
console.log('   - Check: Vercel function logs for token errors');
console.log('');

console.log('5. 🚫 MISSING AUTHORIZATION HEADER');
console.log('   - Frontend not sending token');
console.log('   - CORS blocking headers');
console.log('   - Check: Browser Network tab');
console.log('');

console.log('🧪 IMMEDIATE DIAGNOSTIC STEPS:');
console.log('');

console.log('STEP 1: Force Vercel Rebuild');
console.log('1. Go to Vercel dashboard');
console.log('2. Select your project');
console.log('3. Go to Settings → General');
console.log('4. Click "Redeploy" or trigger new deployment');
console.log('5. Ensure "Skip Build Cache" is unchecked');
console.log('');

console.log('STEP 2: Check Vercel Function Logs');
console.log('1. Go to Vercel dashboard → Functions tab');
console.log('2. Look for /api requests');
console.log('3. Check for authentication errors');
console.log('4. Look for MongoDB connection issues');
console.log('5. Look for JWT decoding errors');
console.log('');

console.log('STEP 3: Test API Directly');
console.log('curl -H "Authorization: Bearer <token>" https://gmcraft.sixsmithgames.com/api/projects');
console.log('');

console.log('STEP 4: Check Network Headers');
console.log('1. Open browser dev tools → Network');
console.log('2. Make API call (refresh page)');
console.log('3. Check /api/projects request');
console.log('4. Verify Authorization header is present');
console.log('5. Check response body for error details');
console.log('');

console.log('🔧 LIKELY FIXES:');
console.log('');

console.log('If build cache issue:');
console.log('- Force rebuild on Vercel');
console.log('- Clear Vercel cache');
console.log('- Redeploy without cache');
console.log('');

console.log('If MongoDB connection issue:');
console.log('- Check MONGODB_URI on Vercel');
console.log('- Verify MongoDB Atlas network access');
console.log('- Check Vercel function logs');
console.log('');

console.log('If token format issue:');
console.log('- The fixed middleware handles multiple formats');
console.log('- Should work with Clerk tokens');
console.log('- Check logs for token processing');
console.log('');

console.log('📊 SHARE THIS INFO FOR DEBUGGING:');
console.log('');
console.log('1. Vercel function logs (last 50 lines)');
console.log('2. Network tab screenshot showing Authorization header');
console.log('3. Exact error response body from /api/projects');
console.log('4. Vercel environment variables list');
console.log('5. Whether force rebuild was performed');
