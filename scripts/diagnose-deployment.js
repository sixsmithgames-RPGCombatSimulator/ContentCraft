#!/usr/bin/env node

/**
 * Deployment Diagnostic Script for Multi-Brand Products
 * Helps identify configuration issues for ContentCraft, GameMasterCraft, and SagaCraft
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🔍 Multi-Brand Deployment Diagnostic\n');

// Check 1: Environment Variables
console.log('1. Environment Variable Configuration...');
const envFiles = ['.env', '.env.local', '.env.production'];
let envConfig = {};

envFiles.forEach(file => {
  const envPath = join(projectRoot, file);
  if (existsSync(envPath)) {
    console.log(`✅ Found ${file}`);
    try {
      const content = readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach(line => {
        if (line.includes('NEXT_PUBLIC_PRODUCT_KEY') || line.includes('VITE_PRODUCT_KEY')) {
          console.log(`   📋 ${line.trim()}`);
        }
        if (line.includes('CORS_ORIGIN')) {
          console.log(`   🌐 ${line.trim()}`);
        }
        if (line.includes('NODE_ENV')) {
          console.log(`   🔧 ${line.trim()}`);
        }
      });
    } catch (error) {
      console.log(`   ❌ Error reading ${file}: ${error.message}`);
    }
  } else {
    console.log(`❌ Missing ${file}`);
  }
});

// Check 2: Product Configuration
console.log('\n2. Product Configuration Validation...');
try {
  const clientConfig = readFileSync(join(projectRoot, 'client/src/config/products.ts'), 'utf8');
  const serverConfig = readFileSync(join(projectRoot, 'src/server/config/products.ts'), 'utf8');
  
  console.log('✅ Product config files exist');
  
  // Check for SagaCraft configuration
  if (clientConfig.includes('sagacraft') && serverConfig.includes('sagacraft')) {
    console.log('✅ SagaCraft configuration found');
  } else {
    console.log('❌ SagaCraft configuration missing');
  }
  
  // Check for environment variable resolvers
  if (clientConfig.includes('getProductKey') && serverConfig.includes('getProductKey')) {
    console.log('✅ Environment variable resolvers present');
  } else {
    console.log('❌ Environment variable resolvers missing');
  }
} catch (error) {
  console.log('❌ Error reading product configs:', error.message);
}

// Check 3: Build Configuration
console.log('\n3. Build Status Check...');
const buildPaths = [
  'dist/server/index.js',
  'dist/client/index.html',
  'dist/client/assets'
];

buildPaths.forEach(path => {
  const fullPath = join(projectRoot, path);
  if (existsSync(fullPath)) {
    console.log(`✅ ${path} exists`);
  } else {
    console.log(`❌ ${path} missing - run 'npm run build'`);
  }
});

// Check 4: Server Configuration
console.log('\n4. Server Configuration...');
try {
  const appConfig = readFileSync(join(projectRoot, 'src/server/app.ts'), 'utf8');
  
  if (appConfig.includes('express.static')) {
    console.log('✅ Static file serving configured');
  } else {
    console.log('❌ Static file serving missing');
  }
  
  if (appConfig.includes('helmet')) {
    console.log('✅ Security headers configured');
  } else {
    console.log('❌ Security headers missing');
  }
  
  if (appConfig.includes('CORS_ORIGIN')) {
    console.log('✅ CORS configuration present');
  } else {
    console.log('❌ CORS configuration missing');
  }
} catch (error) {
  console.log('❌ Error reading server config:', error.message);
}

console.log('\n🎯 Common Deployment Issues & Solutions:');
console.log('');
console.log('🔧 ENVIRONMENT VARIABLES:');
console.log('   • Ensure NEXT_PUBLIC_PRODUCT_KEY=sagacraft is set');
console.log('   • Set CORS_ORIGIN=https://sagacraft.sixsmithgames.com');
console.log('   • Set NODE_ENV=production');
console.log('');
console.log('🌐 DOMAIN CONFIGURATION:');
console.log('   • DNS must point sagacraft.sixsmithgames.com to your server');
console.log('   • SSL certificate must be valid for the domain');
console.log('   • Port 443 (HTTPS) must be open and configured');
console.log('');
console.log('🚀 DEPLOYMENT STEPS:');
console.log('   1. Build: npm run build');
console.log('   2. Set environment variables in hosting platform');
console.log('   3. Deploy to hosting service (Vercel, etc.)');
console.log('   4. Verify domain points to deployed service');
console.log('');
console.log('🔍 DEBUGGING COMMANDS:');
console.log('   • Check server logs: Look for startup errors');
console.log('   • Test with curl: curl -I https://sagacraft.sixsmithgames.com');
console.log('   • Check SSL: openssl s_client -connect sagacraft.sixsmithgames.com:443');
console.log('');
console.log('📋 Required Environment Variables for SagaCraft:');
console.log('   NEXT_PUBLIC_PRODUCT_KEY=sagacraft');
console.log('   NEXT_PUBLIC_PRODUCT_NAME=SagaCraft');
console.log('   NEXT_PUBLIC_CANONICAL_APP_URL=https://sagacraft.sixsmithgames.com');
console.log('   CORS_ORIGIN=https://sagacraft.sixsmithgames.com');
console.log('   NODE_ENV=production');
console.log('   PORT=3001 (or as required by hosting)');
