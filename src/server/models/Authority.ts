/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export interface Authority {
  _id: string; // "authority"
  source_order: ('campaign' | 'homebrew' | 'raw_2024' | 'raw_2014')[];
  rule_toggles: Record<string, boolean>;
  invention_policy_default: 'none' | 'cosmetic' | 'minor_items' | 'side_npcs' | 'locations' | 'full';
  forbidden_inventions: string[];
}

export const DEFAULT_AUTHORITY: Authority = {
  _id: 'authority',
  source_order: ['campaign', 'homebrew', 'raw_2024', 'raw_2014'],
  rule_toggles: {
    ascendant_combat: true,
    surprise_variant: true,
    called_shot_limit: true,
  },
  invention_policy_default: 'cosmetic',
  forbidden_inventions: [
    'always-on detection',
    'new spells without explicit approval',
    'free damage riders on at-will attacks',
    'retroactive retcons of named NPCs/factions',
    'setting-warping locations without a gate/clock',
  ],
};
