-- Migration: Add productKey and workspaceType to projects table
-- This migration adds support for multi-brand deployments

-- Add new columns to projects table
ALTER TABLE projects ADD COLUMN product_key TEXT DEFAULT 'contentcraft';
ALTER TABLE projects ADD COLUMN workspace_type TEXT DEFAULT 'creative_project';

-- Create index for product filtering
CREATE INDEX idx_projects_product_key ON projects(product_key);
CREATE INDEX idx_projects_workspace_type ON projects(workspace_type);

-- Update existing projects to have default values
UPDATE projects SET 
  product_key = 'contentcraft',
  workspace_type = 'creative_project'
WHERE product_key IS NULL OR workspace_type IS NULL;
