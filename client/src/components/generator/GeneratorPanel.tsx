/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useEffect, useMemo, useState } from 'react';
import { Play, Settings, BookOpen, Building2 } from 'lucide-react';
import TemplateSelector from './TemplateSelector';
import ConstraintEditor from './ConstraintEditor';
import { ProjectType } from '../../types';

interface GeneratorPanelProps {
  onGenerate: (config: GenerationConfig) => void;
  isLoading?: boolean;
  projectType?: ProjectType;
}

export interface GenerationConfig {
  type:
    | 'story_arc'
    | 'scene'
    | 'encounter'
    | 'npc'
    | 'monster'
    | 'item'
    | 'adventure'
    | 'homebrew'
    | 'location'
    | 'outline'
    | 'chapter'
    | 'nonfiction'
    | 'memoir'
    | 'journal_entry'
    | 'diet_log_entry'
    | 'other_writing';
  prompt: string;
  max_canon_facts: number;
  flags: {
    rule_base: '2024RAW' | '2014RAW' | string;
    allow_invention: 'none' | 'cosmetic' | 'minor_items' | 'side_npcs' | 'locations' | 'full';
    mode: 'GM' | 'player';
    tone: string;
    difficulty: 'easy' | 'standard' | 'deadly' | 'boss';
    realism: 'strict' | 'cinematic';
    domain?: 'rpg' | 'writing';
    strict_room_adherence?: boolean; // For locations: only generate rooms explicitly listed in the prompt
    /** Optional location template identifier used by locationCreatorStages */
    template_id?: string;
  };
  homebrewFile?: File;
}

export default function GeneratorPanel({ onGenerate, isLoading = false, projectType }: GeneratorPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDesignControls, setShowDesignControls] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const preferredDomain: 'rpg' | 'writing' = useMemo(() => {
    if (projectType === ProjectType.DND_ADVENTURE || projectType === ProjectType.DND_HOMEBREW) {
      return 'rpg';
    }
    if (
      projectType === ProjectType.NON_FICTION ||
      projectType === ProjectType.RESEARCH ||
      projectType === ProjectType.HEALTH_ADVICE ||
      projectType === ProjectType.FICTION
    ) {
      return 'writing';
    }
    return 'rpg';
  }, [projectType]);

  const allowedDomains: Array<'rpg' | 'writing'> = useMemo(() => {
    if (projectType === ProjectType.DND_ADVENTURE || projectType === ProjectType.DND_HOMEBREW) {
      return ['rpg'];
    }
    if (
      projectType === ProjectType.NON_FICTION ||
      projectType === ProjectType.RESEARCH ||
      projectType === ProjectType.HEALTH_ADVICE
    ) {
      return ['writing'];
    }
    return ['rpg', 'writing'];
  }, [projectType]);

  const inferDefaultType = (domain: 'rpg' | 'writing'): GenerationConfig['type'] => {
    if (domain === 'writing') {
      if (
        projectType === ProjectType.NON_FICTION ||
        projectType === ProjectType.RESEARCH ||
        projectType === ProjectType.HEALTH_ADVICE
      ) {
        return 'nonfiction';
      }
      return 'outline';
    }
    return 'story_arc';
  };

  const normalizeConfigForDomain = (prev: GenerationConfig, newDomain: 'rpg' | 'writing'): GenerationConfig => {
    const defaultType = inferDefaultType(newDomain);

    const RPG_TYPES = new Set<GenerationConfig['type']>([
      'story_arc',
      'encounter',
      'scene',
      'npc',
      'monster',
      'item',
      'location',
      'adventure',
      'homebrew',
    ]);

    const WRITING_TYPES = new Set<GenerationConfig['type']>([
      'outline',
      'chapter',
      'scene',
      'nonfiction',
      'memoir',
      'journal_entry',
      'diet_log_entry',
      'other_writing',
    ]);

    const nextType =
      newDomain === 'writing'
        ? (WRITING_TYPES.has(prev.type) ? prev.type : defaultType)
        : (RPG_TYPES.has(prev.type) ? prev.type : defaultType);

    return {
      ...prev,
      type: nextType,
      flags: {
        ...prev.flags,
        domain: newDomain,
      },
    };
  };

  const [config, setConfig] = useState<GenerationConfig>(() => {
    const defaultDomain = allowedDomains.includes(preferredDomain)
      ? preferredDomain
      : (allowedDomains[0] ?? 'rpg');
    const defaultType = inferDefaultType(defaultDomain);

    return {
      type: defaultType,
      prompt: '',
      max_canon_facts: 50,
      flags: {
        rule_base: '2024RAW',
        allow_invention: 'cosmetic',
        mode: 'GM',
        tone: 'epic',
        difficulty: 'standard',
        realism: 'cinematic',
        domain: defaultDomain,
      },
    };
  });

  useEffect(() => {
    const current = config.flags.domain ?? preferredDomain;
    const fallback = allowedDomains.includes(preferredDomain) ? preferredDomain : (allowedDomains[0] ?? 'rpg');
    const next = allowedDomains.includes(current) ? current : fallback;
    if (next !== current) {
      setConfig((prev) => normalizeConfigForDomain(prev, next));
    }
  }, [allowedDomains, preferredDomain, config.flags.domain]);

  const domain = (() => {
    const candidate = config.flags.domain ?? preferredDomain;
    if (allowedDomains.includes(candidate)) return candidate;
    if (allowedDomains.includes(preferredDomain)) return preferredDomain;
    return allowedDomains[0] ?? 'rpg';
  })();

  const contentTypeOptions: Array<{ value: GenerationConfig['type']; label: string }> =
    domain === 'writing'
      ? [
          { value: 'outline', label: 'Outline' },
          { value: 'chapter', label: 'Chapter' },
          { value: 'scene', label: 'Scene' },
          { value: 'nonfiction', label: 'Non-fiction' },
          { value: 'memoir', label: 'Memoir' },
          { value: 'journal_entry', label: 'Personal Journal Entry' },
          { value: 'diet_log_entry', label: 'Diet Log Entry' },
          { value: 'other_writing', label: 'Other Written Content' },
        ]
      : [
          { value: 'story_arc', label: 'Story Arc' },
          { value: 'encounter', label: 'Combat Encounter' },
          { value: 'scene', label: 'Narrative Scene' },
          { value: 'npc', label: 'Non-Player Character' },
          { value: 'monster', label: 'Monster / Creature' },
          { value: 'item', label: 'Magic Item' },
          { value: 'location', label: 'Location / Castle' },
          { value: 'adventure', label: 'Full Adventure' },
          { value: 'homebrew', label: 'Homebrew Document' },
        ];

  // Determine which flags are relevant for the current content type
  const showDifficulty = domain === 'rpg' && ['encounter'].includes(config.type);
  const showMode = domain === 'rpg' && ['scene', 'adventure', 'story_arc'].includes(config.type);
  const showRealism = domain === 'rpg' && ['encounter', 'scene', 'adventure'].includes(config.type);
  const showRuleBase = domain === 'rpg';

  const handleDomainChange = (newDomain: 'rpg' | 'writing') => {
    if (!allowedDomains.includes(newDomain)) return;
    setConfig((prev) => normalizeConfigForDomain(prev, newDomain));
  };

  const handleTypeChange = (newType: GenerationConfig['type']) => {
    // Update type and set appropriate defaults for that type
    setConfig({
      ...config,
      type: newType,
      flags: {
        ...config.flags,
        // Set mode to GM for scenes/adventures, keep current for others
        mode: ['scene', 'adventure', 'story_arc'].includes(newType) ? config.flags.mode : 'GM',
        // Set difficulty for encounters only
        difficulty: newType === 'encounter' ? config.flags.difficulty : 'standard',
        // Set realism for encounters/scenes/adventures
        realism: ['encounter', 'scene', 'adventure'].includes(newType) ? config.flags.realism : 'cinematic',
      },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isHomebrew = config.type === 'homebrew';
    const canSubmit = isHomebrew ? Boolean(config.homebrewFile) : Boolean(config.prompt.trim());
    if (canSubmit) {
      const flags: Partial<GenerationConfig['flags']> = {
        allow_invention: config.flags.allow_invention,
        tone: config.flags.tone,
        domain: config.flags.domain,
      };

      if (showRuleBase) {
        flags.rule_base = config.flags.rule_base;
      }

      // Only include mode for scenes, adventures, story arcs
      if (showMode) {
        flags.mode = config.flags.mode;
      }

      // Only include difficulty for encounters
      if (showDifficulty) {
        flags.difficulty = config.flags.difficulty;
      }

      // Only include realism for encounters, scenes, adventures
      if (showRealism) {
        flags.realism = config.flags.realism;
      }

      // Include template_id and strict_room_adherence for locations
      if (config.type === 'location') {
        if (selectedTemplateId) {
          flags.template_id = selectedTemplateId;
        }
        if (config.flags.strict_room_adherence) {
          flags.strict_room_adherence = config.flags.strict_room_adherence;
        }
      }

      const filteredConfig: GenerationConfig = {
        ...config,
        flags: flags as GenerationConfig['flags'],
      };

      onGenerate(filteredConfig);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <BookOpen className="w-6 h-6" />
          {domain === 'writing'
            ? 'Writing Content Generator'
            : projectType === ProjectType.DND_ADVENTURE || projectType === ProjectType.DND_HOMEBREW
            ? 'D&D Content Generator'
            : 'Tabletop RPG Content Generator'}
        </h2>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          <Settings className="w-4 h-4" />
          {showAdvanced ? 'Hide' : 'Show'} Advanced
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Domain
          </label>
          {allowedDomains.length === 1 ? (
            <div className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-700 text-sm">
              {allowedDomains[0] === 'writing'
                ? 'Writing'
                : projectType === ProjectType.DND_ADVENTURE || projectType === ProjectType.DND_HOMEBREW
                ? 'Tabletop RPG (D&D)'
                : 'Tabletop RPG'}
            </div>
          ) : (
            <select
              value={domain}
              onChange={(e) => handleDomainChange(e.target.value as 'rpg' | 'writing')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {allowedDomains.includes('rpg') && (
                <option value="rpg">
                  {projectType === ProjectType.DND_ADVENTURE || projectType === ProjectType.DND_HOMEBREW
                    ? 'Tabletop RPG (D&D)'
                    : 'Tabletop RPG'}
                </option>
              )}
              {allowedDomains.includes('writing') && (
                <option value="writing">Writing (Books, Journals, Logs)</option>
              )}
            </select>
          )}
        </div>

        {/* Content Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Content Type
          </label>
          <select
            value={config.type}
            onChange={(e) => handleTypeChange(e.target.value as GenerationConfig['type'])}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {contentTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Prompt or Homebrew File Upload based on type */}
        {config.type === 'homebrew' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Homebrew Document
            </label>
            <input
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setConfig({ ...config, homebrewFile: file, prompt: `Extracting from: ${file.name}` });
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Upload a PDF or text file containing homebrew content. Large files will be split into manageable chunks for processing.
            </p>
            {config.homebrewFile && (
              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-800">
                  Selected: <strong>{config.homebrewFile.name}</strong> ({(config.homebrewFile.size / 1024).toFixed(1)} KB)
                </p>
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Generation Prompt
            </label>
            <textarea
              value={config.prompt}
              onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
              placeholder={
                domain === 'writing'
                  ? "Describe what you want to write... (e.g., 'A 10-chapter outline for a memoir about starting a small business')"
                  : "Describe what you want to generate... (e.g., 'A deadly dragon encounter in a mountain lair near Waterdeep')"
              }
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              required
            />
            <div className="mt-1 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Be specific! The generator will search your canon and homebrew resources to create content that fits your world.
              </p>
              {/* Character Budget Indicator */}
              <div className="flex items-center gap-2 text-xs">
                <span className={`font-mono ${
                  config.prompt.length > 2000 ? 'text-red-600' :
                  config.prompt.length > 1500 ? 'text-amber-600' :
                  'text-gray-500'
                }`}>
                  {config.prompt.length.toLocaleString()}
                </span>
                <span className="text-gray-400">/</span>
                <span className="text-gray-400">~2,000 chars</span>
                {config.prompt.length > 0 && (
                  <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        config.prompt.length > 2000 ? 'bg-red-500' :
                        config.prompt.length > 1500 ? 'bg-amber-500' :
                        config.prompt.length > 500 ? 'bg-green-500' :
                        'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(100, (config.prompt.length / 2000) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
            {config.prompt.length > 2000 && (
              <p className="mt-1 text-xs text-red-600">
                ⚠️ Long prompts may be truncated by some AI platforms. Consider being more concise.
              </p>
            )}
          </div>
        )}

        {/* Design Controls - Only for locations */}
        {config.type === 'location' && (
          <div>
            <button
              type="button"
              onClick={() => setShowDesignControls(!showDesignControls)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 w-full justify-center"
            >
              <Building2 className="w-4 h-4" />
              {showDesignControls ? 'Hide' : 'Show'} Design Controls
            </button>

            {showDesignControls && (
              <div className="mt-4 space-y-4 p-4 bg-gray-50 rounded-md border border-gray-200">
                <TemplateSelector
                  selectedTemplateId={selectedTemplateId}
                  onSelectTemplate={setSelectedTemplateId}
                />

                {selectedTemplateId && (
                  <ConstraintEditor templateId={selectedTemplateId} disabled={true} />
                )}

                {/* Strict Room Adherence Toggle */}
                <div className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-md">
                  <input
                    type="checkbox"
                    id="strict-room-adherence"
                    checked={config.flags.strict_room_adherence || false}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        flags: { ...config.flags, strict_room_adherence: e.target.checked },
                      })
                    }
                    className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <label htmlFor="strict-room-adherence" className="block text-sm font-medium text-gray-700 cursor-pointer">
                      Strict Room Adherence
                    </label>
                    <p className="mt-1 text-xs text-gray-500">
                      AI will ONLY generate rooms explicitly listed in your prompt. No additional rooms will be added.
                      Use this to maintain exact control over your floor plan.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Advanced Settings */}
        {showAdvanced && (
          <div className="space-y-4 p-4 bg-gray-50 rounded-md border border-gray-200">
            <h3 className="font-medium text-gray-700 text-sm">Advanced Settings</h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Rule Base */}
              {showRuleBase && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rule Base
                  </label>
                  <select
                    value={config.flags.rule_base}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        flags: { ...config.flags, rule_base: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="2024RAW">D&D 2024 Rules</option>
                    <option value="2014RAW">D&D 2014 Rules</option>
                    <option value="HouseRules:custom">House Rules</option>
                  </select>
                </div>
              )}

              {/* Tone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tone
                </label>
                <input
                  type="text"
                  value={config.flags.tone}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      flags: { ...config.flags, tone: e.target.value },
                    })
                  }
                  placeholder="epic, dark, comedic..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>

              {/* Invention Policy */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Allow Invention
                </label>
                <select
                  value={config.flags.allow_invention}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      flags: { ...config.flags, allow_invention: e.target.value as GenerationConfig['flags']['allow_invention'] },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="none">None (Canon Only)</option>
                  <option value="cosmetic">Cosmetic Details</option>
                  <option value="minor_items">Minor Items</option>
                  <option value="side_npcs">Side NPCs</option>
                  <option value="locations">New Locations</option>
                  <option value="full">Full Creativity</option>
                </select>
              </div>

              {/* Max Canon Facts */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Canon Facts
                </label>
                <input
                  type="number"
                  min="10"
                  max="500"
                  value={config.max_canon_facts}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      max_canon_facts: parseInt(e.target.value) || 50,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  title="Maximum number of canon facts to include per stage. If exceeded, you'll be prompted to narrow the search."
                />
                <p className="text-xs text-gray-500 mt-1">Prompt to narrow if exceeded</p>
              </div>

              {/* Mode - Only for scenes, adventures, story arcs */}
              {showMode && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mode
                  </label>
                  <select
                    value={config.flags.mode}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        flags: { ...config.flags, mode: e.target.value as 'GM' | 'player' },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="GM">GM View (Full Details)</option>
                    <option value="player">Player View (No Secrets)</option>
                  </select>
                </div>
              )}

              {/* Difficulty - Only for encounters */}
              {showDifficulty && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Encounter Difficulty
                  </label>
                  <select
                    value={config.flags.difficulty}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        flags: { ...config.flags, difficulty: e.target.value as GenerationConfig['flags']['difficulty'] },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="easy">Easy</option>
                    <option value="standard">Standard</option>
                    <option value="deadly">Deadly</option>
                    <option value="boss">Boss Fight</option>
                  </select>
                </div>
              )}

              {/* Realism - Only for encounters, scenes, adventures */}
              {showRealism && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Realism
                  </label>
                  <select
                    value={config.flags.realism}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        flags: { ...config.flags, realism: e.target.value as GenerationConfig['flags']['realism'] },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="strict">Strict Physics</option>
                    <option value="cinematic">Cinematic</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Generation Summary / Cycle Estimate */}
        {config.prompt.trim() && config.type !== 'homebrew' && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1 text-sm">
                <p className="font-medium text-blue-800">Generation Summary</p>
                <div className="mt-1 text-blue-700 space-y-0.5">
                  {config.type === 'location' ? (
                    <>
                      <p>📋 <strong>5 stages</strong> (Purpose → Foundation → Spaces → Details → Accuracy)</p>
                      <p>🔄 <strong>~8-15 copy/paste cycles</strong> (varies by number of spaces)</p>
                      <p>⏱️ <strong>~15-30 minutes</strong> estimated</p>
                    </>
                  ) : config.type === 'npc' ? (
                    <>
                      <p>📋 <strong>6 stages</strong> (Identity → Background → Personality → Abilities → Relationships → Validation)</p>
                      <p>🔄 <strong>~6-8 copy/paste cycles</strong></p>
                      <p>⏱️ <strong>~10-15 minutes</strong> estimated</p>
                    </>
                  ) : config.type === 'encounter' ? (
                    <>
                      <p>📋 <strong>4 stages</strong> (Setup → Combatants → Tactics → Validation)</p>
                      <p>🔄 <strong>~4-6 copy/paste cycles</strong></p>
                      <p>⏱️ <strong>~8-12 minutes</strong> estimated</p>
                    </>
                  ) : (
                    <>
                      <p>📋 <strong>Multiple stages</strong> (varies by content type)</p>
                      <p>🔄 <strong>~4-8 copy/paste cycles</strong></p>
                      <p>⏱️ <strong>~10-20 minutes</strong> estimated</p>
                    </>
                  )}
                </div>
                <p className="mt-2 text-xs text-blue-600">
                  💡 Tip: Enable "Batch Mode" during Spaces generation to auto-accept remaining spaces
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || (config.type === 'homebrew' ? !config.homebrewFile : !config.prompt.trim())}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {config.type === 'homebrew' ? 'Extracting...' : 'Generating...'}
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              {config.type === 'homebrew' ? 'Extract Homebrew' : 'Generate Content'}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
