#!/usr/bin/env node

/**
 * Clerk Authentication Diagnosis Script
 * Identifies why authentication is failing after deployment
 */

console.log('🔍 Clerk Authentication Diagnosis\n');

console.log('📋 Possible Issues (Railway deployed but still 401):');
console.log('');

console.log('1. 🔐 TOKEN FORMAT MISMATCH');
console.log('   Issue: Clerk tokens might not be in expected JWT format');
console.log('   Check: Browser dev tools → Network → Headers → Authorization');
console.log('   Expected: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
console.log('');

console.log('2. 🌧️ MONGODB CONNECTION');
console.log('   Issue: User creation failing in MongoDB');
console.log('   Check: Railway logs for MongoDB connection errors');
console.log('   Impact: Authentication succeeds but user creation fails');
console.log('');

console.log('3. 🔄 SINGLE_USER_MODE OVERRIDE');
console.log('   Issue: SINGLE_USER_MODE=true in Railway environment');
console.log('   Check: Railway environment variables');
console.log('   Effect: Bypasses Clerk authentication entirely');
console.log('');

console.log('4. 📝 TOKEN DECODING ERROR');
console.log('   Issue: jwt.decode() failing on Clerk token format');
console.log('   Check: Railway logs for JWT decoding errors');
console.log('   Fix: Might need Clerk SDK instead of manual decoding');
console.log('');

console.log('5. 🚫 MISSING AUTHORIZATION HEADER');
console.log('   Issue: Frontend not sending Authorization header');
console.log('   Check: Network tab for missing Authorization header');
console.log('   Cause: Clerk session not properly attached to requests');
console.log('');

console.log('🧪 IMMEDIATE DIAGNOSTIC STEPS:');
console.log('');

console.log('STEP 1: Check Railway Logs');
console.log('- Look for authentication errors');
console.log('- Look for MongoDB connection issues');
console.log('- Look for JWT decoding errors');
console.log('');

console.log('STEP 2: Check Browser Network Tab');
console.log('1. Open dev tools → Network');
console.log('2. Make API call (refresh page)');
console.log('3. Check /api/projects request');
console.log('4. Look for Authorization header');
console.log('5. Check response body for error details');
console.log('');

console.log('STEP 3: Test API Directly');
console.log('curl -H "Authorization: Bearer <token>" <your-railway-url>/api/projects');
console.log('');

console.log('🔧 LIKELY FIXES:');
console.log('');

console.log('If SINGLE_USER_MODE is enabled:');
console.log('- Set SINGLE_USER_MODE=false in Railway');
console.log('- Or remove the environment variable entirely');
console.log('');

console.log('If token decoding fails:');
console.log('- Need to use Clerk SDK for proper token verification');
console.log('- Current implementation uses basic jwt.decode()');
console.log('');

console.log('If MongoDB fails:');
console.log('- Check MONGODB_URI in Railway environment');
console.log('- Verify network access in MongoDB Atlas');
console.log('');

console.log('If Authorization header missing:');
console.log('- Clerk session not properly configured');
console.log('- Frontend not attaching token to requests');
console.log('');

console.log('📊 SHARE THIS INFO FOR DEBUGGING:');
console.log('');
console.log('1. Railway deployment logs (last 50 lines)');
console.log('2. Network tab screenshot showing Authorization header');
console.log('3. Exact error response body from /api/projects');
console.log('4. Railway environment variables list');
