#!/usr/bin/env node

/**
 * Test script to validate multi-brand product deployments
 * Tests ContentCraft, GameMasterCraft, and SagaCraft configurations
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🧪 Testing Multi-Brand Product Deployments\n');

// Test 1: Verify product config files exist
console.log('1. Checking product configuration files...');
try {
  const clientConfig = readFileSync(join(projectRoot, 'client/src/config/products.ts'), 'utf8');
  const serverConfig = readFileSync(join(projectRoot, 'src/server/config/products.ts'), 'utf8');
  
  if (clientConfig.includes('contentcraft') && clientConfig.includes('gamemastercraft') && clientConfig.includes('sagacraft')) {
    console.log('✅ Client product config contains all three products');
  } else {
    console.log('❌ Client product config missing products');
  }
  
  if (serverConfig.includes('contentcraft') && serverConfig.includes('gamemastercraft') && serverConfig.includes('sagacraft')) {
    console.log('✅ Server product config contains all three products');
  } else {
    console.log('❌ Server product config missing products');
  }
} catch (error) {
  console.log('❌ Failed to read product config files:', error.message);
}

// Test 2: Verify theme classes exist in CSS
console.log('\n2. Checking CSS theme classes...');
try {
  const css = readFileSync(join(projectRoot, 'client/src/index.css'), 'utf8');
  
  const themes = ['theme-contentcraft', 'theme-gamemastercraft', 'theme-sagacraft'];
  themes.forEach(theme => {
    if (css.includes(theme)) {
      console.log(`✅ ${theme} class found in CSS`);
    } else {
      console.log(`❌ ${theme} class missing from CSS`);
    }
  });
} catch (error) {
  console.log('❌ Failed to read CSS file:', error.message);
}

// Test 3: Verify SEO utility exists
console.log('\n3. Checking SEO utility...');
try {
  const seoUtils = readFileSync(join(projectRoot, 'client/src/utils/seo.ts'), 'utf8');
  
  if (seoUtils.includes('updateProductSEO') && seoUtils.includes('getProductConfig')) {
    console.log('✅ SEO utility exists and uses product config');
  } else {
    console.log('❌ SEO utility missing or incomplete');
  }
} catch (error) {
  console.log('❌ Failed to read SEO utility:', error.message);
}

// Test 4: Verify database migration exists
console.log('\n4. Checking database migration...');
try {
  const migration = readFileSync(join(projectRoot, 'migrations/add_product_fields_to_projects.sql'), 'utf8');
  
  if (migration.includes('product_key') && migration.includes('workspace_type')) {
    console.log('✅ Database migration includes new product fields');
  } else {
    console.log('❌ Database migration missing product fields');
  }
} catch (error) {
  console.log('❌ Failed to read migration file:', error.message);
}

// Test 5: Verify TypeScript types include new fields
console.log('\n5. Checking TypeScript types...');
try {
  const clientTypes = readFileSync(join(projectRoot, 'client/src/types/index.ts'), 'utf8');
  const serverTypes = readFileSync(join(projectRoot, 'src/shared/types/index.ts'), 'utf8');
  
  const requiredFields = ['productKey', 'workspaceType'];
  
  requiredFields.forEach(field => {
    if (clientTypes.includes(field)) {
      console.log(`✅ Client types include ${field}`);
    } else {
      console.log(`❌ Client types missing ${field}`);
    }
    
    if (serverTypes.includes(field)) {
      console.log(`✅ Server types include ${field}`);
    } else {
      console.log(`❌ Server types missing ${field}`);
    }
  });
} catch (error) {
  console.log('❌ Failed to read type files:', error.message);
}

// Test 6: Verify components use product config
console.log('\n6. Checking component integration...');
const componentsToCheck = [
  'client/src/App.tsx',
  'client/src/components/Navbar.tsx',
  'client/src/pages/Dashboard.tsx',
  'client/src/pages/CreateProject.tsx'
];

componentsToCheck.forEach(componentPath => {
  try {
    const component = readFileSync(join(projectRoot, componentPath), 'utf8');
    
    if (component.includes('getProductConfig')) {
      console.log(`✅ ${componentPath.split('/').pop()} uses product config`);
    } else {
      console.log(`❌ ${componentPath.split('/').pop()} doesn't use product config`);
    }
  } catch (error) {
    console.log(`❌ Failed to read ${componentPath}:`, error.message);
  }
});

// Test 7: Verify server model updates
console.log('\n7. Checking server model updates...');
try {
  const projectModel = readFileSync(join(projectRoot, 'src/server/models/Project.ts'), 'utf8');
  
  if (projectModel.includes('productKey') && projectModel.includes('workspaceType')) {
    console.log('✅ Server Project model includes new fields');
  } else {
    console.log('❌ Server Project model missing new fields');
  }
  
  if (projectModel.includes('contentcraft') && projectModel.includes('Fallback for existing projects')) {
    console.log('✅ Server model includes fallback logic');
  } else {
    console.log('❌ Server model missing fallback logic');
  }
} catch (error) {
  console.log('❌ Failed to read server model:', error.message);
}

console.log('\n🎯 Product deployment validation complete!');
console.log('\n📋 Next steps for deployment:');
console.log('1. Run database migration: migrations/add_product_fields_to_projects.sql');
console.log('2. Configure Vercel environment variables for each product');
console.log('3. Deploy to three separate Vercel projects');
console.log('4. Test each domain loads correct branding');
console.log('5. Verify workspace creation saves correct productKey/workspaceType');
