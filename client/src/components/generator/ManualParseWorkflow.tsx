/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useEffect, useRef, useState } from 'react';
import { Copy, Check, ArrowRight } from 'lucide-react';
import { parseAIResponse, formatParseError } from '../../utils/jsonParser';
import {
  addProgressEntry,
  createProgressSession,
  listProgressFiles,
  loadProgressFromFile,
  saveProgressToFile,
  updateProgressResponse,
  type GenerationConfig,
  type GenerationProgress,
} from '../../utils/generationProgress';

interface ManualParseWorkflowProps {
  projectId: string;
  onComplete: (entities: ParsedEntity[]) => void;
  onCancel: () => void;
}

interface ParsedClaim {
  text: string;
  source: string;
}

interface ParsedEntity {
  type: string;
  canonical_name: string;
  aliases: string[];
  era?: string;
  region?: string;
  claims: ParsedClaim[];
  [key: string]: unknown;
}

interface DocumentChunk {
  index: number;
  title: string;
  content: string;
}

type ManualParseStep = 'input' | 'show-prompt' | 'paste-response';

interface ManualParsePersistedState {
  step: ManualParseStep;
  template: ParseTemplate;
  documentText: string;
  sourceName: string;
  chunks: DocumentChunk[] | null;
  currentChunkIndex: number;
  accumulatedEntities: ParsedEntity[];
  fullPrompt: string;
  aiResponse: string;
}

type ProgressFileSummary = {
  filename: string;
  sessionId: string;
  sessionName?: string;
  createdAt: string;
  lastUpdatedAt: string;
  config: Record<string, unknown>;
};

type ParseTemplate = 'rpg' | 'writing';

const RPG_ENTITY_TYPES = [
  'npc',
  'monster',
  'item',
  'spell',
  'location',
  'faction',
  'rule',
  'timeline',
] as const;

const WRITING_ENTITY_TYPES = [
  'npc',
  'item',
  'location',
  'faction',
  'rule',
  'timeline',
] as const;

function getAllowedEntityTypes(template: ParseTemplate): string[] {
  return template === 'writing' ? [...WRITING_ENTITY_TYPES] : [...RPG_ENTITY_TYPES];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function splitDocumentIntoChunks(text: string, maxChunkSize: number): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const lines = text.split('\n');
  let currentChunk = '';
  let currentTitle = 'Introduction';
  let chunkIndex = 0;
  let foundFirstHeader = false;

  const isHeaderLine = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed) return false;

    if (/^#{1,6}\s+\S+/.test(trimmed)) return true;
    if (/^(Chapter|Part|Section)\b/i.test(trimmed)) return true;
    if (/^\d+\./.test(trimmed)) return true;
    if (trimmed.length < 80 && trimmed === trimmed.toUpperCase()) return true;
    if (/^[A-Z][A-Za-z0-9\s\-']+:$/.test(trimmed)) return true;

    return false;
  };

  const normalizeTitle = (line: string): string => {
    const trimmed = line.trim();
    const withoutMarkdown = trimmed.replace(/^#{1,6}\s+/, '');
    return withoutMarkdown.replace(/:$/, '').trim() || 'Untitled';
  };

  const pushChunk = (title: string, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    chunks.push({ index: chunkIndex, title, content: trimmed });
    chunkIndex += 1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const isHeader = isHeaderLine(trimmed);

    if (isHeader && (foundFirstHeader || currentChunk.length > 500)) {
      pushChunk(currentTitle, currentChunk);
      currentChunk = '';
      currentTitle = normalizeTitle(trimmed);
      foundFirstHeader = true;
      continue;
    }

    if (!isHeader) {
      currentChunk += line + '\n';
      if (currentChunk.length > maxChunkSize) {
        const partNum = chunks.filter(c => c.title.startsWith(currentTitle)).length + 1;
        const partTitle = currentTitle + ' (Part ' + partNum + ')';
        pushChunk(partTitle, currentChunk);
        currentChunk = '';
      }
    }
  }

  pushChunk(currentTitle, currentChunk);

  if (chunks.length === 0) {
    return [{ index: 0, title: 'Document', content: text.trim() }];
  }

  return chunks;
}

function mergeParsedEntities(existing: ParsedEntity[], incoming: ParsedEntity[]): ParsedEntity[] {
  const keyFor = (entity: ParsedEntity): string => {
    const type = typeof entity.type === 'string' ? entity.type.trim().toLowerCase() : '';
    const name = typeof entity.canonical_name === 'string' ? entity.canonical_name.trim().toLowerCase() : '';
    return `${type}::${name}`;
  };

  const mergeAliases = (a: unknown, b: unknown): string[] => {
    const set = new Set<string>();
    const add = (value: unknown) => {
      if (!Array.isArray(value)) return;
      for (const entry of value) {
        if (typeof entry === 'string') {
          const trimmed = entry.trim();
          if (trimmed) set.add(trimmed);
        }
      }
    };
    add(a);
    add(b);
    return Array.from(set);
  };

  const mergeClaims = (a: unknown, b: unknown): ParsedClaim[] => {
    const claims: ParsedClaim[] = [];
    const seen = new Set<string>();
    const add = (value: unknown) => {
      if (!Array.isArray(value)) return;
      for (const entry of value) {
        if (!entry || typeof entry !== 'object') continue;
        const rec = entry as Record<string, unknown>;
        const text = typeof rec.text === 'string' ? rec.text.trim() : '';
        const source = typeof rec.source === 'string' ? rec.source.trim() : '';
        if (!text) continue;
        const key = `${text.toLowerCase()}::${source.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        claims.push({ text, source });
      }
    };
    add(a);
    add(b);
    return claims;
  };

  const mergedByKey = new Map<string, ParsedEntity>();

  const upsert = (entity: ParsedEntity) => {
    const key = keyFor(entity);
    if (!key.includes('::') || key.endsWith('::')) {
      return;
    }

    const existingEntity = mergedByKey.get(key);
    if (!existingEntity) {
      mergedByKey.set(key, { ...entity, aliases: Array.isArray(entity.aliases) ? entity.aliases : [] });
      return;
    }

    const next: ParsedEntity = { ...existingEntity };

    next.aliases = mergeAliases(existingEntity.aliases, entity.aliases);
    next.claims = mergeClaims(existingEntity.claims, entity.claims);

    for (const [k, v] of Object.entries(entity)) {
      if (k === 'aliases' || k === 'claims') continue;
      if (next[k] === undefined || next[k] === null || next[k] === '') {
        next[k] = v;
        continue;
      }
      if (isRecord(next[k]) && isRecord(v)) {
        const base = next[k] as Record<string, unknown>;
        const addl = v as Record<string, unknown>;
        const combined: Record<string, unknown> = { ...base };
        for (const [subKey, subVal] of Object.entries(addl)) {
          if (combined[subKey] === undefined || combined[subKey] === null || combined[subKey] === '') {
            combined[subKey] = subVal;
          }
        }
        next[k] = combined;
      }
    }

    mergedByKey.set(key, next);
  };

  existing.forEach(upsert);
  incoming.forEach(upsert);

  return Array.from(mergedByKey.values());
}

function getSystemPrompt(template: ParseTemplate): string {
  if (template === 'writing') {
    return `You are a writing content extraction expert.
Your job is to read writing-related documents (fiction, non-fiction, memoir, journal, logs) and extract discrete entities with comprehensive detail.

IMPORTANT JSON FORMATTING RULES:
- NEVER use double quotes within string values (causes JSON parse errors)
- For quoted text or nicknames, use single quotes or brackets instead
  WRONG: "allies_friends": ["The "Silver" Knight"]
  RIGHT: "allies_friends": ["The Silver Knight", "The [Silver] Knight"]
- For apostrophes in possessive nouns, escape them or avoid if possible
  WRONG: "text": "Elara's spellbook"
  RIGHT: "text": "Elara's spellbook" OR "The spellbook of Elara"
- Always validate that your JSON has no nested quotes before outputting

ENTITY TYPES:
- npc: People / characters (real people in memoirs, characters in fiction)
- location: Places, settings, real-world locations
- faction: Organizations, groups, companies, institutions
- timeline: Events, dates, milestones, key happenings
- item: Important objects, artifacts, documents, tools
- rule: Concepts, constraints, themes, definitions, policies

EXTRACTION RULES:
1. Extract ALL distinct entities from the document
2. For each entity, provide:
   - type: the entity type from the list above
   - canonical_name: the primary name
   - aliases: alternative names/nicknames
   - era: optional time period
   - region: optional geographic region
   - claims: array of factual statements
     * Each claim must be a SINGLE discrete fact (1-3 sentences max)
     * Each claim must include source reference: "source_name:section_X" or "source_name:page_X"
3. Only include fields where information is present - omit empty fields
4. Be conservative: only extract information that is clearly stated
5. Do NOT invent information not present in the source

OUTPUT FORMAT (JSON):
{
  "entities": [
    {
      "type": "npc",
      "canonical_name": "Jane Doe",
      "aliases": ["J. Doe"],
      "claims": [
        { "text": "Jane Doe founded Acme Publishing in 2012.", "source": "memoir_draft:section_2" }
      ]
    }
  ]
}

Output ONLY valid JSON. No prose, no explanations outside the JSON structure.`;
  }

  return `You are a D&D content extraction expert.
Your job is to read D&D campaign documents and extract discrete entities with comprehensive detail.

IMPORTANT JSON FORMATTING RULES:
- NEVER use double quotes within string values (causes JSON parse errors)
- For quoted text or nicknames, use single quotes or brackets instead
  WRONG: "allies_friends": ["The "Silver" Knight"]
  RIGHT: "allies_friends": ["The Silver Knight", "The [Silver] Knight"]
- For apostrophes in possessive nouns, escape them or avoid if possible
  WRONG: "text": "Elara's spellbook"
  RIGHT: "text": "Elara's spellbook" OR "The spellbook of Elara"
- Always validate that your JSON has no nested quotes before outputting

ENTITY TYPES:
- npc: Named non-player characters (people, sentient beings)
- monster: Creatures, beasts, monsters (stat blocks, encounters)
- item: Magic items, artifacts, weapons, armor
- spell: Spells and magical effects
- location: Places, regions, buildings, landmarks
- faction: Organizations, guilds, factions, groups
- rule: Game mechanics, house rules, custom rules
- timeline: Historical events, timelines, eras

NPC-SPECIFIC FIELDS (extract when type="npc"):
- class_levels: class and level (e.g., "Wizard 12", "Fighter 5/Rogue 3")
- hit_points: HP value if mentioned
- personality_traits: array of personality traits
- physical_appearance: overall description
- identifying_features: notable physical features (visible or hidden)
- motivations: what drives them
- ideals: beliefs and values
- flaws: character weaknesses
- skill_proficiencies: array of skills they're proficient in
- weapon_proficiencies: array of weapon proficiencies
- armor_proficiencies: array of armor proficiencies
- other_proficiencies: languages, tools, etc.
- spells_known: array of spells they know
- spells_prepared: array of spells currently prepared
- equipment_carried: items on their person
- equipment_owned: items they own but not carrying
- deeds_titles: official titles, honors, deeds
- allies_friends: array of allies/friends
- foes: array of enemies
- family: family members
- political_knowledge: what they know about politics
- political_preferences: their political leanings
- political_influence: their political power/connections

EXTRACTION RULES:
1. Extract ALL distinct entities from the document
2. For each entity, provide:
   - type: the entity type from the list above
   - canonical_name: the primary name (e.g., "Elara Moonshadow")
   - aliases: alternative names/nicknames (e.g., ["The Silver Sage"])
   - era: optional time period (e.g., "post-sundering")
   - region: optional geographic region (e.g., "waterdeep")
   - claims: array of factual statements (for non-NPC or general facts)
     * Each claim must be a SINGLE discrete fact (1-3 sentences max)
     * Each claim must include source reference: "source_name:page_X"

SPELL-SPECIFIC FIELDS (extract when type="spell"):

CORE PROPERTIES (always extract):
- level: spell level (0-9, cantrips are 0)
- school: school of magic (Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, Transmutation)
- ritual: can it be cast as a ritual (true/false)
- concentration: requires concentration (true/false)
- casting_time: how long to cast (e.g., "1 action", "1 minute", "1 reaction")
- range: spell range (e.g., "Self", "Touch", "30 feet", "120 feet")
- components: object with:
  - verbal: requires verbal component (true/false)
  - somatic: requires somatic component (true/false)
  - material: requires material component (true/false)
  - materials: description of materials if material=true
- duration: how long it lasts (e.g., "Instantaneous", "Up to 1 minute", "8 hours")
- description: full spell description (keep complete rules text for reference)
- higher_levels: description of effects when cast at higher levels (optional)

PARSED DAMAGE MECHANICS (extract from description):
- damage: array of damage objects, each with:
  - dice: damage dice (e.g., "8d6", "3d10")
  - bonus: flat bonus damage (number)
  - type: damage type (e.g., "fire", "lightning", "necrotic", "radiant")
  - on_success: what happens on successful save (e.g., "half", "none")
- damage_scaling: how damage increases (e.g., "+1d6 per slot level above 3rd")

SAVES AND ATTACKS (extract from description):
- save_type: saving throw type (e.g., "Dexterity", "Wisdom", "Constitution")
- save_dc_modifier: DC calculation (e.g., "spellcasting ability", "10 + spell level")
- attack_type: attack type (e.g., "melee spell attack", "ranged spell attack")
- attack_modifier: attack modifier (e.g., "spellcasting ability")

CONDITIONS AND EFFECTS (extract from description):
- conditions_inflicted: array of conditions applied (e.g., ["cursed", "frightened", "stunned", "charmed"])
- conditions_removed: array of conditions removed (e.g., ["charmed", "paralyzed", "poisoned"])
- buffs_granted: array of beneficial effects (e.g., ["advantage on Dexterity (Stealth) checks", "can use action to call lightning"])
- debuffs_inflicted: array of negative effects (e.g., ["disadvantage on attack rolls", "movement speed reduced to 0"])

AREA AND TARGETING (extract from description):
- area_of_effect: object with:
  - type: shape (e.g., "sphere", "cone", "line", "cube", "cylinder")
  - size: dimensions (e.g., "20-foot radius", "30-foot cone", "60-foot line")
- targets: object with:
  - type: target type (e.g., "creature", "object", "point", "self", "area")
  - count: number of targets (e.g., 1, "up to 3", "any number")
  - restrictions: array of restrictions (e.g., ["willing", "hostile", "Large or smaller"])

ACTION ECONOMY (extract from description):
- action_economy_effect: effect on actions (e.g., "target loses action", "target wastes action doing nothing")
- reaction_trigger: what triggers the reaction (e.g., "when you see a creature casting a spell", "when an enemy makes a ranged attack")

ADDITIONAL MECHANICS (extract from description):
- requires_line_of_sight: needs line of sight (true/false)
- can_target_objects: can target objects (true/false)
- ongoing_effects: array of ongoing effects (e.g., ["creatures entering area take damage", "can use action each turn to call lightning"])
- dismissible: can be dismissed as an action (true/false)
- upcast_effects: array of specific upcast effects beyond damage (e.g., ["duration increases to 10 minutes", "can affect one additional creature"])

METADATA (optional):
- source: where the spell is from (e.g., "PHB 2024", "SRD 5.1")

3. For NPCs, extract ALL available detail fields listed above
4. For Spells, extract ALL spell-specific fields listed above
5. Only include fields where information is present - omit empty fields
6. Be conservative: only extract information that is clearly stated
7. Do NOT invent information not present in the source

OUTPUT FORMAT (JSON):
{
  "entities": [
    {
      "type": "npc",
      "canonical_name": "Elara Moonshadow",
      "aliases": ["The Silver Sage"],
      "era": "post-sundering",
      "region": "waterdeep",
      "class_levels": "Wizard 12",
      "hit_points": 68,
      "personality_traits": ["Wise and patient", "Enjoys riddles"],
      "physical_appearance": "Elderly high elf with silver hair and piercing blue eyes",
      "identifying_features": ["Crescent moon birthmark on left palm"],
      "motivations": "Protect Waterdeep from magical threats",
      "ideals": "Knowledge should be shared, not hoarded",
      "flaws": "Overly trusting of other elves",
      "skill_proficiencies": ["Arcana", "History", "Insight"],
      "weapon_proficiencies": ["Daggers", "Quarterstaffs"],
      "other_proficiencies": ["Elvish", "Draconic", "Alchemist's Tools"],
      "spells_known": ["Fireball", "Counterspell", "Detect Magic"],
      "equipment_carried": ["Staff of Power", "Spellbook", "Component Pouch"],
      "allies_friends": ["Lord Neverember", "Blackstaff Academy", "The [Golden] Lion Inn"],
      "political_influence": "Advisor to the Lords of Waterdeep",
      "claims": [
        { "text": "Elara Moonshadow is a high elf wizard residing in Waterdeep.", "source": "campaign_doc:section_1" }
      ]
    },
    {
      "type": "spell",
      "canonical_name": "Fireball",
      "aliases": [],
      "level": 3,
      "school": "Evocation",
      "ritual": false,
      "concentration": false,
      "casting_time": "1 action",
      "range": "150 feet",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materials": "A tiny ball of bat guano and sulfur."
      },
      "duration": "Instantaneous",
      "description": "A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere centered on that point must make a dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.",
      "higher_levels": "When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.",
      "damage_type": "fire",
      "save_type": "Dexterity",
      "source": "PHB 2024",
      "claims": []
    }
  ]
}

Output ONLY valid JSON. No prose, no explanations outside the JSON structure.`;
}

export default function ManualParseWorkflow({ projectId, onComplete, onCancel }: ManualParseWorkflowProps) {
  const [step, setStep] = useState<ManualParseStep>('input');
  const [template, setTemplate] = useState<ParseTemplate>('rpg');
  const [documentText, setDocumentText] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [copied, setCopied] = useState(false);
  const [fullPrompt, setFullPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [chunks, setChunks] = useState<DocumentChunk[] | null>(null);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [accumulatedEntities, setAccumulatedEntities] = useState<ParsedEntity[]>([]);

  const [progressSession, setProgressSession] = useState<GenerationProgress | null>(null);
  const [progressFilename, setProgressFilename] = useState<string | null>(null);

  const [resumeCandidates, setResumeCandidates] = useState<ProgressFileSummary[]>([]);
  const [selectedResumeFilename, setSelectedResumeFilename] = useState<string | null>(null);
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);

  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildSessionFilename = (sessionId: string) => `manual-parse-${projectId}-${sessionId}.json`;

  const buildPersistedState = (overrides?: Partial<ManualParsePersistedState>): ManualParsePersistedState => {
    return {
      step,
      template,
      documentText,
      sourceName,
      chunks,
      currentChunkIndex,
      accumulatedEntities,
      fullPrompt,
      aiResponse,
      ...overrides,
    };
  };

  const saveSession = async (session: GenerationProgress, filename: string) => {
    setProgressSession(session);
    setProgressFilename(filename);
    await saveProgressToFile(session, filename);
  };

  const ensureSession = async (persistedState: ManualParsePersistedState) => {
    if (progressSession && progressFilename) {
      return { session: progressSession, filename: progressFilename };
    }

    const session = createProgressSession({
      type: 'manual_parse',
      projectId,
      prompt: persistedState.sourceName,
      sourceName: persistedState.sourceName,
      template: persistedState.template,
      completed: false,
    } as GenerationConfig);

    const filename = buildSessionFilename(session.sessionId);
    const updatedSession: GenerationProgress = {
      ...session,
      lastUpdatedAt: new Date().toISOString(),
      stageResults: {
        manual_parse: persistedState as unknown as Record<string, unknown>,
      },
    };

    await saveSession(updatedSession, filename);
    return { session: updatedSession, filename };
  };

  const persistProgress = async (overrides?: Partial<ManualParsePersistedState>) => {
    const persisted = buildPersistedState(overrides);
    const ensured = await ensureSession(persisted);

    const updated: GenerationProgress = {
      ...(ensured.session as GenerationProgress),
      lastUpdatedAt: new Date().toISOString(),
      config: {
        ...(ensured.session.config as unknown as Record<string, unknown>),
        type: 'manual_parse',
        projectId,
        prompt: persisted.sourceName,
        sourceName: persisted.sourceName,
        template: persisted.template,
        completed: false,
      } as GenerationConfig,
      stageResults: {
        ...(ensured.session.stageResults as unknown as Record<string, unknown>),
        manual_parse: persisted as unknown as Record<string, unknown>,
      },
    };

    await saveSession(updated, ensured.filename);
  };

  const loadResumeCandidates = async () => {
    try {
      const files = (await listProgressFiles()) as unknown as ProgressFileSummary[];
      const filtered = files
        .filter((f) => {
          const cfg = f?.config as Record<string, unknown> | undefined;
          return cfg?.type === 'manual_parse' && cfg?.projectId === projectId && cfg?.completed !== true;
        })
        .sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime());

      setResumeCandidates(filtered);
      setSelectedResumeFilename(filtered[0]?.filename ?? null);
    } catch {
      setResumeCandidates([]);
      setSelectedResumeFilename(null);
    }
  };

  useEffect(() => {
    loadResumeCandidates();
    setResumeDismissed(false);
  }, [projectId]);

  useEffect(() => {
    if (!progressSession || !progressFilename) return;
    if (step !== 'paste-response') return;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      persistProgress().catch(() => undefined);
    }, 800);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
    };
  }, [aiResponse, step, progressSession, progressFilename]);

  const handleResume = async () => {
    if (!selectedResumeFilename) return;
    setResumeLoading(true);
    setError(null);

    try {
      const session = await loadProgressFromFile(selectedResumeFilename);
      if (!session) {
        throw new Error('Failed to load saved progress');
      }

      const persisted = (session.stageResults as unknown as Record<string, unknown>)?.manual_parse as
        | ManualParsePersistedState
        | undefined;

      if (!persisted) {
        throw new Error('Saved progress is missing manual parse state');
      }

      setProgressSession(session);
      setProgressFilename(selectedResumeFilename);

      setStep(persisted.step);
      setTemplate(persisted.template);
      setDocumentText(persisted.documentText);
      setSourceName(persisted.sourceName);
      setChunks(persisted.chunks);
      setCurrentChunkIndex(persisted.currentChunkIndex);
      setAccumulatedEntities(persisted.accumulatedEntities);
      setFullPrompt(persisted.fullPrompt);
      setAiResponse(persisted.aiResponse);
      setResumeDismissed(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resume');
    } finally {
      setResumeLoading(false);
    }
  };

  const handleDiscardResume = async () => {
    if (!selectedResumeFilename) {
      setResumeDismissed(true);
      return;
    }

    try {
      await fetch(`http://localhost:3001/api/delete-progress?filename=${encodeURIComponent(selectedResumeFilename)}`, {
        method: 'DELETE',
      });
      await loadResumeCandidates();
      setResumeDismissed(true);
    } catch {
      setResumeDismissed(true);
    }
  };

  const handleGeneratePrompt = async () => {
    if (!documentText.trim()) {
      setError('Please enter some text to parse');
      return;
    }
    if (!sourceName.trim()) {
      setError('Please enter a source name');
      return;
    }

    const maxChunkSize = template === 'writing' ? 6000 : 3500;
    const nextChunks = splitDocumentIntoChunks(documentText, maxChunkSize);
    setChunks(nextChunks);
    setCurrentChunkIndex(0);
    setAccumulatedEntities([]);

    const activeChunk = nextChunks[0];
    const chunkLabel = nextChunks.length > 1
      ? `Chunk ${activeChunk.index + 1} of ${nextChunks.length} (${activeChunk.title})`
      : 'Full Document';

    const userPrompt = `Document: ${sourceName}
${chunkLabel}

---

${activeChunk.content}

---

Extract all entities from the above text following the rules. Output ONLY valid JSON.`;

    const systemPrompt = getSystemPrompt(template);
    const combined = `${systemPrompt}\n\n---\n\nUSER INPUT:\n${userPrompt}`;
    setFullPrompt(combined);
    setError(null);
    setStep('show-prompt');

    const persisted = buildPersistedState({
      step: 'show-prompt',
      template,
      documentText,
      sourceName,
      chunks: nextChunks,
      currentChunkIndex: 0,
      accumulatedEntities: [],
      fullPrompt: combined,
      aiResponse: '',
    });

    try {
      const { session, filename } = await ensureSession(persisted);
      const updatedSession = addProgressEntry(session, 'Manual Parse', 0, combined);
      await saveSession(updatedSession, filename);
    } catch {}
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullPrompt);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setStep('paste-response');
      persistProgress({ step: 'paste-response' }).catch(() => undefined);
    }, 600);
  };

  const handleSubmitResponse = () => {
    console.log('[ManualParseWorkflow] handleSubmitResponse called');
    console.log('[ManualParseWorkflow] AI Response length:', aiResponse.length);
    console.log('[ManualParseWorkflow] AI Response:', aiResponse.substring(0, 500) + (aiResponse.length > 500 ? '...' : ''));

    setError(null);

    try {
      // Parse JSON response with improved error handling
      console.log('[ManualParseWorkflow] Attempting to parse JSON...');
      const parseResult = parseAIResponse(aiResponse);

      if (!parseResult.success) {
        const errorMessage = formatParseError(parseResult);
        throw new Error(errorMessage);
      }

      const parsed = parseResult.data as { entities?: unknown };
      console.log('[ManualParseWorkflow] JSON parsed successfully:', parsed);

      if (!parsed.entities || !Array.isArray(parsed.entities)) {
        throw new Error('Response must contain an "entities" array');
      }

      console.log('[ManualParseWorkflow] Found entities array with', parsed.entities.length, 'entities');

      const allowedTypes = new Set(getAllowedEntityTypes(template));

      // Validate entities
      const normalizedEntities: ParsedEntity[] = [];

      for (let i = 0; i < parsed.entities.length; i++) {
        const entity = parsed.entities[i] as ParsedEntity;
        const canonicalName = typeof entity.canonical_name === 'string' ? entity.canonical_name.trim() : '';
        const type = typeof entity.type === 'string' ? entity.type.trim().toLowerCase() : '';

        console.log(`[ManualParseWorkflow] Validating entity ${i + 1}:`, canonicalName, type);

        if (!type || !canonicalName) {
          throw new Error(`Entity ${i + 1} missing required fields: type and canonical_name`);
        }
        if (!allowedTypes.has(type)) {
          throw new Error(
            `Entity "${canonicalName}" has unsupported type "${type}" for this template. Allowed types: ${Array.from(allowedTypes).join(', ')}`
          );
        }
        if (!entity.claims || !Array.isArray(entity.claims) || entity.claims.length === 0) {
          throw new Error(`Entity "${canonicalName}" must have at least one claim`);
        }

        entity.type = type;
        entity.canonical_name = canonicalName;
        entity.aliases = Array.isArray(entity.aliases)
          ? entity.aliases.filter((a) => typeof a === 'string').map((a) => a.trim()).filter(Boolean)
          : [];

        console.log(`[ManualParseWorkflow] Entity ${i + 1} validated: ${entity.claims.length} claims`);

        normalizedEntities.push(entity);
      }

      const nextAccumulated = mergeParsedEntities(accumulatedEntities, normalizedEntities);

      if (chunks && chunks.length > 1) {
        const isLastChunk = currentChunkIndex >= chunks.length - 1;
        if (!isLastChunk) {
          const nextIndex = currentChunkIndex + 1;
          const nextChunk = chunks[nextIndex];

          setAccumulatedEntities(nextAccumulated);
          setCurrentChunkIndex(nextIndex);
          setAiResponse('');

          const chunkLabel = `Chunk ${nextChunk.index + 1} of ${chunks.length} (${nextChunk.title})`;
          const userPrompt = `Document: ${sourceName}
${chunkLabel}

---

${nextChunk.content}

---

Extract all entities from the above text following the rules. Output ONLY valid JSON.`;

          const systemPrompt = getSystemPrompt(template);
          const combined = `${systemPrompt}\n\n---\n\nUSER INPUT:\n${userPrompt}`;
          setFullPrompt(combined);
          setStep('show-prompt');

          if (progressSession && progressFilename) {
            const updatedWithResponse = updateProgressResponse(progressSession, aiResponse, 'completed');
            const updatedWithNextPrompt = addProgressEntry(updatedWithResponse, 'Manual Parse', nextIndex, combined);
            saveSession(
              {
                ...updatedWithNextPrompt,
                lastUpdatedAt: new Date().toISOString(),
                stageResults: {
                  ...(updatedWithNextPrompt.stageResults as unknown as Record<string, unknown>),
                  manual_parse: buildPersistedState({
                    step: 'show-prompt',
                    chunks,
                    currentChunkIndex: nextIndex,
                    accumulatedEntities: nextAccumulated,
                    fullPrompt: combined,
                    aiResponse: '',
                  }) as unknown as Record<string, unknown>,
                },
              },
              progressFilename
            ).catch(() => undefined);
          } else {
            persistProgress({
              step: 'show-prompt',
              chunks,
              currentChunkIndex: nextIndex,
              accumulatedEntities: nextAccumulated,
              fullPrompt: combined,
              aiResponse: '',
            }).catch(() => undefined);
          }
          return;
        }
      }

      console.log('[ManualParseWorkflow] All entities validated successfully. Calling onComplete with', nextAccumulated.length, 'entities');

      if (progressSession && progressFilename) {
        const updatedWithResponse = updateProgressResponse(progressSession, aiResponse, 'completed');
        saveSession(
          {
            ...updatedWithResponse,
            lastUpdatedAt: new Date().toISOString(),
            config: {
              ...updatedWithResponse.config,
              completed: true,
            },
            stageResults: {
              ...(updatedWithResponse.stageResults as Record<string, unknown>),
              manual_parse: buildPersistedState({
                accumulatedEntities: nextAccumulated,
              }),
            },
          },
          progressFilename
        ).catch(() => undefined);
      } else {
        persistProgress({
          accumulatedEntities: nextAccumulated,
        }).catch(() => undefined);
      }

      onComplete(nextAccumulated);
    } catch (err: any) {
      console.error('[ManualParseWorkflow] Error parsing/validating response:', err);

      // Enhanced error messaging for JSON parse errors
      let errorMessage = err.message;

      if (err instanceof SyntaxError) {
        // Try to extract line/column info from the error message
        const match = err.message.match(/position (\d+)/);
        if (match) {
          const position = parseInt(match[1]);
          const lines = aiResponse.substring(0, position).split('\n');
          const lineNumber = lines.length;
          const columnNumber = lines[lines.length - 1].length;

          // Get context around the error (50 chars before and after)
          const start = Math.max(0, position - 50);
          const end = Math.min(aiResponse.length, position + 50);
          const context = aiResponse.substring(start, end);
          const pointer = ' '.repeat(Math.min(50, position - start)) + '^';

          errorMessage = `JSON syntax error at line ${lineNumber}, column ${columnNumber}:

Common issues:
- Trailing commas in arrays/objects (remove commas after last item)
- Missing quotes around strings
- Unescaped quotes inside strings (use \\" for quotes within strings)
- Double quotes within double quotes ("like ""this""" should be "like \\"this\\"")
- Missing commas between items

Context around error position ${position}:
${context}
${pointer}

Original error: ${err.message}`;
        }
      }

      setError(`Failed to parse response: ${errorMessage}`);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700 whitespace-pre-wrap font-mono">{error}</p>
        </div>
      )}

      {step === 'input' && !resumeDismissed && resumeCandidates.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-md space-y-3">
          <div className="text-sm text-amber-900 font-medium">Saved parse progress found for this project</div>
          <div className="flex gap-3 items-center">
            <select
              value={selectedResumeFilename ?? ''}
              onChange={(e) => setSelectedResumeFilename(e.target.value)}
              className="flex-1 px-3 py-2 border border-amber-300 rounded-md bg-white"
            >
              {resumeCandidates.map((f) => (
                <option key={f.filename} value={f.filename}>
                  {(f.sessionName || 'Manual Parse') + ' - ' + new Date(f.lastUpdatedAt).toLocaleString()}
                </option>
              ))}
            </select>
            <button
              onClick={handleResume}
              disabled={!selectedResumeFilename || resumeLoading}
              className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Resume
            </button>
            <button
              onClick={handleDiscardResume}
              className="px-4 py-2 border border-amber-300 text-amber-900 rounded-md hover:bg-amber-100"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {step === 'input' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Parsing Template
            </label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as ParseTemplate)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="rpg">Tabletop RPG (D&D)</option>
              <option value="writing">Writing (Books, Journals, Logs)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Source Name *
            </label>
            <input
              type="text"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder={
                template === 'writing'
                  ? "e.g., 'Memoir Draft', 'Journal 2026-01-01'"
                  : "e.g., 'My Campaign Guide', 'Waterdeep NPCs'"
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              This will be used as the source reference for all extracted facts
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Document Text *
            </label>
            <textarea
              value={documentText}
              onChange={(e) => setDocumentText(e.target.value)}
              placeholder={
                template === 'writing'
                  ? "Paste your writing content here...\n\nExample:\n# Chapter 1\n\nIn 2012, I moved to Chicago to start a new job at Acme Publishing.\n\n# Key People\n\nJane Doe was my manager and introduced me to the editorial team..."
                  : "Paste your D&D campaign content here...\n\nExample:\n# Waterdeep NPCs\n\nElara Moonshadow is a high elf wizard known as the Silver Sage. She resides in the Castle Ward and specializes in divination magic.\n\n# Monsters\n\nThe Shadow Dragon of Mount Hotenow terrorizes the Sword Coast..."
              }
              rows={16}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none font-mono text-sm"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <h4 className="font-medium text-blue-900 mb-2">How Manual Parse Works</h4>
            <ol className="text-sm text-blue-800 space-y-1">
              <li><strong>1.</strong> Paste your campaign document text above</li>
              <li><strong>2.</strong> Click "Generate Prompt" to create an AI prompt</li>
              <li><strong>3.</strong> Copy the prompt and paste into any AI chat (ChatGPT, Claude, etc.)</li>
              <li><strong>4.</strong> Copy the AI's JSON response and paste it back here</li>
              <li><strong>5.</strong> Entities are automatically extracted and saved!</li>
            </ol>
            <p className="text-xs text-blue-700 mt-3">
              Large documents are automatically split into multiple chunks to avoid overwhelming the AI.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 px-6 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleGeneratePrompt}
                className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Generate Prompt
              </button>
            </div>

            <button
              onClick={() => {
                setStep('paste-response');
                persistProgress({ step: 'paste-response' }).catch(() => undefined);
              }}
              className="w-full px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 flex items-center justify-center gap-2"
            >
              <span>Already have AI response? Skip to Paste →</span>
            </button>
          </div>
        </>
      )}

      {step === 'show-prompt' && (
        <>
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
            <span>Step 1 of 2</span>
            <ArrowRight className="w-4 h-4" />
            <span className="font-medium text-gray-700">Copy Prompt to AI</span>
          </div>

          {chunks && chunks.length > 1 && (
            <div className="text-xs text-gray-600 mb-3">
              Processing chunk {currentChunkIndex + 1} of {chunks.length}: {chunks[currentChunkIndex]?.title}
            </div>
          )}

          <p className="text-gray-600 mb-4">
            Copy this prompt and paste it into your AI chat (ChatGPT, Claude, Gemini, etc.)
          </p>

          <div className="relative">
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono max-h-96 overflow-auto">
              {fullPrompt}
            </pre>
            <button
              onClick={handleCopy}
              disabled={copied}
              className={`absolute top-2 right-2 flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                copied
                  ? 'bg-green-100 text-green-700 cursor-default'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy
                </>
              )}
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setChunks(null);
                setCurrentChunkIndex(0);
                setAccumulatedEntities([]);
                setAiResponse('');
                setFullPrompt('');
                setProgressSession(null);
                setProgressFilename(null);
                setStep('input');
              }}
              className="px-6 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100"
            >
              Back
            </button>
          </div>
        </>
      )}

      {step === 'paste-response' && (
        <>
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
            <span>Step 2 of 2</span>
            <ArrowRight className="w-4 h-4" />
            <span className="font-medium text-gray-700">Paste AI Response</span>
          </div>

          {chunks && chunks.length > 1 && (
            <div className="text-xs text-gray-600 mb-3">
              Paste response for chunk {currentChunkIndex + 1} of {chunks.length}: {chunks[currentChunkIndex]?.title}
            </div>
          )}

          <p className="text-gray-600 mb-4">
            Paste the JSON response from your AI chat below, then click Submit to extract entities.
          </p>

          <textarea
            value={aiResponse}
            onChange={(e) => setAiResponse(e.target.value)}
            placeholder='Paste AI response here (should be JSON like):
{
  "entities": [
    {
      "type": "npc",
      "canonical_name": "Elara Moonshadow",
      ...
    }
  ]
}'
            rows={16}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none font-mono text-sm"
          />

          <div className="flex gap-3">
            <button
              onClick={() => setStep('show-prompt')}
              className="px-6 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100"
            >
              Back
            </button>
            <button
              onClick={handleSubmitResponse}
              disabled={!aiResponse.trim()}
              className="flex-1 px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Submit & Extract Entities
            </button>
          </div>
        </>
      )}
    </div>
  );
}
