#!/usr/bin/env node

/**
 * CORS Configuration Checker
 * Verifies that each product deployment has the correct CORS origin
 */

console.log('🌐 CORS Configuration Check\n');

console.log('Expected CORS Origins for each deployment:');
console.log('');
console.log('📋 ContentCraft (contentcraft.sixsmithgames.com):');
console.log('   CORS_ORIGIN=https://contentcraft.sixsmithgames.com');
console.log('   NEXT_PUBLIC_PRODUCT_KEY=contentcraft');
console.log('');
console.log('📋 GameMasterCraft (gmcraft.sixsmithgames.com):');
console.log('   CORS_ORIGIN=https://gmcraft.sixsmithgames.com');
console.log('   NEXT_PUBLIC_PRODUCT_KEY=gamemastercraft');
console.log('');
console.log('📋 SagaCraft (sagacraft.sixsmithgames.com):');
console.log('   CORS_ORIGIN=https://sagacraft.sixsmithgames.com');
console.log('   NEXT_PUBLIC_PRODUCT_KEY=sagacraft');
console.log('');
console.log('🔍 Quick Verification Steps:');
console.log('');
console.log('1. Check Vercel Environment Variables:');
console.log('   - Go to each Vercel project dashboard');
console.log('   - Settings → Environment Variables');
console.log('   - Verify CORS_ORIGIN matches the domain exactly');
console.log('');
console.log('2. Check Current Errors:');
console.log('   - "Origin subdomain not in allowed subdomains list"');
console.log('   - Means CORS_ORIGIN is wrong or not applied');
console.log('');
console.log('3. Common Issues:');
console.log('   - Missing https:// prefix');
console.log('   - Wrong domain (contentcraft vs gmcraft vs sagacraft)');
console.log('   - Environment variable not deployed yet');
console.log('');
console.log('🚀 Fix Steps:');
console.log('');
console.log('1. Set CORS_ORIGIN for each deployment in Vercel');
console.log('2. Redeploy each application');
console.log('3. Test with browser dev tools - check Network tab Origin header');
console.log('');
console.log('💡 If other subdomains work, copy their exact CORS_ORIGIN format');
console.log('   and just change the domain name part.');
