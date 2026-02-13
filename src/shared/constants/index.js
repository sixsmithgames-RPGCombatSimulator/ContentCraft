/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export const API_ENDPOINTS = {
    PROJECTS: '/api/projects',
    CONTENT: '/api/content',
    PROMPTS: '/api/prompts',
    FACT_CHECKS: '/api/fact-checks',
    AI_GENERATE: '/api/ai/generate',
    RESEARCH: '/api/research'
};
export const DEFAULT_PAGINATION = {
    page: 1,
    limit: 20
};
export const AI_SERVICES = {
    OPENAI: 'openai',
    ANTHROPIC: 'anthropic',
    GOOGLE: 'google'
};
export const CONTENT_LIMITS = {
    TITLE_MAX: 200,
    DESCRIPTION_MAX: 1000,
    CONTENT_MAX: 50000,
    VARIABLES_MAX: 20
};
export const PROJECT_TYPE_LABELS = {
    fiction: 'Fiction',
    'non-fiction': 'Non-Fiction',
    'dnd-adventure': 'D&D Adventure',
    'dnd-homebrew': 'D&D Homebrew',
    'health-advice': 'Health Advice',
    research: 'Research'
};
export const CONTENT_TYPE_LABELS = {
    text: 'Text',
    outline: 'Outline',
    chapter: 'Chapter',
    section: 'Section',
    character: 'Character',
    location: 'Location',
    item: 'Item',
    'stat-block': 'Stat Block',
    fact: 'Fact'
};
export const DEFAULT_PROMPT_TEMPLATES = {
    CREATIVE_WRITING: {
        name: 'Creative Writing Assistant',
        template: 'Help me write a {{contentType}} for my {{projectType}} project titled "{{title}}". The tone should be {{tone}} and the target audience is {{audience}}. Here\'s the context: {{context}}',
        variables: ['contentType', 'projectType', 'title', 'tone', 'audience', 'context']
    },
    FACT_CHECK: {
        name: 'Fact Checker',
        template: 'Please fact-check the following claim and provide sources: "{{claim}}". Focus on {{domain}} and provide credible sources with URLs when possible.',
        variables: ['claim', 'domain']
    },
    DND_CHARACTER: {
        name: 'D&D Character Generator',
        template: 'Create a {{race}} {{class}} character for D&D 5e. Level: {{level}}. Background: {{background}}. Include stats, personality traits, and backstory. Setting: {{setting}}',
        variables: ['race', 'class', 'level', 'background', 'setting']
    }
};
