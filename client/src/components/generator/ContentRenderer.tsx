/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

// refactored content
import { useId, type ReactNode } from 'react';
import { ContentType } from '../../types';
import {
  PrimitiveRecord,
  asRecord,
  ensureArray,
  ensureObject,
  ensureString,
  ensureStringArray,
  inferNpcType,
  normalizeNpc,
} from './npcUtils';
import NpcContentView from './NpcContentView';
import LocationContentView from './LocationContentView';

interface ContentRendererProps {
  content: unknown;
  deliverable?: string;
}

interface NonfictionChapter {
  title: string;
  summary?: string;
  keyPoints: string[];
  draftText?: string;
}

interface NormalizedNonfiction {
  title: string;
  subtitle?: string;
  medium?: string;
  genre?: string;
  tone?: string;
  primaryAudience?: string;
  authorRole?: string;
  authorNamePolicy?: string;
  status?: string;
  intendedFormats: string[];
  dedication: string[];
  keywords: string[];
  purpose?: string;
  thesis?: string;
  outline: string[];
  tableOfContents: string[];
  formattedManuscript?: string;
  chapters: NonfictionChapter[];
}

interface StoryArcCharacter {
  name: string;
  role?: string;
  motivation?: {
    purpose?: string;
    reason?: string;
  };
  goals: string[];
  knownBarriers: string[];
  unknownBarriers: string[];
}

const WritingRenderer = ({ raw }: { raw: PrimitiveRecord }) => {
  const rawPrefix = useId();
  const prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '');

  const draft = ensureObject(raw.draft);
  const merged: PrimitiveRecord = Object.keys(draft).length ? { ...raw, ...draft } : raw;

  const work = ensureObject((merged as any).work);
  const chapter = ensureObject((merged as any).chapter);
  const scene = ensureObject((merged as any).scene);
  const entry = ensureObject((merged as any).entry);

  const deliverableLower = ensureString(merged.deliverable).toLowerCase();
  const docTypeLower = ensureString((merged as any).type ?? (merged as any).content_type ?? (merged as any).contentType).toLowerCase();

  const title =
    ensureString(merged.title) ||
    ensureString((merged as any).chapter_title ?? (merged as any).chapterTitle) ||
    ensureString(chapter.title) ||
    ensureString((merged as any).section_title ?? (merged as any).sectionTitle) ||
    ensureString(scene.title) ||
    ensureString(entry.title) ||
    ensureString(work.title) ||
    'Draft';

  const subtitle = ensureString(merged.subtitle) || ensureString(work.subtitle) || undefined;
  const genre = ensureString((merged as any).genre ?? work.genre) || undefined;
  const tone = ensureString((merged as any).tone ?? work.tone) || undefined;

  const summary =
    ensureString((merged as any).summary) ||
    ensureString((merged as any).synopsis) ||
    ensureString((merged as any).abstract) ||
    ensureString(chapter.summary) ||
    ensureString(scene.summary) ||
    undefined;

  const keyPoints = asStringList(
    (merged as any).key_points ??
      (merged as any).keyPoints ??
      chapter.key_points ??
      chapter.keyPoints ??
      scene.key_points ??
      scene.keyPoints,
  );

  const outline = asStringList((merged as any).outline ?? (merged as any).structure ?? (merged as any).outline_structure);
  const toc = asStringList(
    (merged as any).table_of_contents ??
      (merged as any).tableOfContents ??
      (work as any).table_of_contents ??
      (work as any).tableOfContents,
  );

  const chaptersArray = (() => {
    const chapters =
      (Array.isArray((merged as any).chapters) ? ((merged as any).chapters as unknown[]) : []) ||
      (Array.isArray((work as any).chapters) ? (((work as any).chapters as unknown[]) ?? []) : []);

    return ensureArray<{ title: string; summary?: string; keyPoints: string[]; draftText?: string }>(
      chapters,
      (chapterEntry) => {
        const obj = ensureObject(chapterEntry);
        const chapterTitle = ensureString((obj as any).title);
        const chapterSummary = ensureString((obj as any).summary);
        const chapterKeyPoints = ensureStringArray((obj as any).key_points ?? (obj as any).keyPoints);
        const chapterDraft = ensureObject((obj as any).draft);
        const chapterContentArray = ensureArray((obj as any).content, (entry) => {
          if (typeof entry === 'string') return entry.trim() || undefined;
          const entryObj = ensureObject(entry);
          return (
            ensureString((entryObj as any).text) ||
            ensureString((entryObj as any).draft_text ?? (entryObj as any).draftText) ||
            undefined
          );
        }).filter(Boolean);
        const chapterDraftText =
          ensureString((obj as any).draft_text ?? (obj as any).draftText) ||
          ensureString((obj as any).chapter_text ?? (obj as any).chapterText) ||
          ensureString((obj as any).text) ||
          ensureString((obj as any).body) ||
          (typeof (obj as any).content === 'string' ? ensureString((obj as any).content) : '') ||
          (chapterContentArray.length ? chapterContentArray.join('\n\n') : '') ||
          ensureString((chapterDraft as any).draft_text ?? (chapterDraft as any).draftText) ||
          ensureString((chapterDraft as any).text) ||
          ensureString((chapterDraft as any).body);

        if (!chapterTitle && !chapterSummary && chapterKeyPoints.length === 0 && !chapterDraftText) return undefined;
        return {
          title: chapterTitle || 'Untitled Chapter',
          summary: chapterSummary || undefined,
          keyPoints: chapterKeyPoints,
          draftText: chapterDraftText || undefined,
        };
      },
    );
  })();

  const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const chaptersDerivedFromText = (fullText: string) => {
    const base = fullText || '';
    if (!base.trim() || chaptersArray.length === 0) return chaptersArray;
    return chaptersArray.map((ch) => {
      if (ch.draftText && ch.draftText.trim().length > 0) return ch;
      if (!ch.title || !ch.title.trim()) return ch;

      const pattern = new RegExp(
        `(^|\\n)(#{1,6})\\s+.*${escapeRegExp(ch.title.trim())}.*\\s*\\n([\\s\\S]*?)(\\n#{1,6}\\s+|$)`,
        'i',
      );
      const match = base.match(pattern);
      if (!match) return ch;
      const extracted = String(match[3] ?? '').trim();
      if (!extracted) return ch;
      return { ...ch, draftText: extracted };
    });
  };

  const chaptersCombinedDraft = chaptersArray
    .map((ch) => {
      const parts = [ch.title ? `# ${ch.title}` : '', ch.draftText || ''].filter(Boolean);
      return parts.join('\n\n').trim();
    })
    .filter(Boolean)
    .join('\n\n');

  const isLikelyValidationText = (value: string): boolean => {
    const t = value.toLowerCase();

    const strongSignals = [
      'canon alignment',
      'canon facts',
      'canon fact',
      'logic score',
      'alignment score',
      'conflict id',
      'cannot be deterministically',
      'validator output',
    ];
    if (strongSignals.some((signal) => t.includes(signal))) return true;

    const hasValidatorWord = t.includes('validator') || /\bvalidation\b/i.test(value);
    if (!hasValidatorWord) return false;

    const hasValidationStructure =
      t.includes('score') || t.includes('canon') || t.includes('conflict id') || t.includes('cannot be deterministically');
    return hasValidationStructure;
  };

  const draftCandidates = [
    ensureString((merged as any).formatted_text ?? (merged as any).formattedText),
    ensureString((merged as any).formatted_manuscript ?? (merged as any).formattedManuscript),
    ensureString((merged as any).draft_text ?? (merged as any).draftText),
    ensureString(chapter.draft_text ?? chapter.draftText),
    ensureString(scene.draft_text ?? scene.draftText),
    chaptersCombinedDraft,
    ensureString((merged as any).body),
    ensureString((merged as any).text),
    typeof (merged as any).content === 'string' ? ensureString((merged as any).content) : '',
    Array.isArray((merged as any).content)
      ? ensureArray((merged as any).content, (entry) => {
          if (typeof entry === 'string') return entry.trim() || undefined;
          const entryObj = ensureObject(entry);
          return ensureString((entryObj as any).text) || undefined;
        })
          .filter(Boolean)
          .join('\n\n')
      : '',
    ensureString(entry.text),
  ].filter((candidate) => candidate && candidate.trim().length > 0);

  const bestDraftCandidate = (() => {
    for (const candidate of draftCandidates) {
      if (!isLikelyValidationText(candidate)) return candidate;
    }
    return '';
  })();

  const validatorOutputText = (() => {
    for (const candidate of draftCandidates) {
      if (isLikelyValidationText(candidate)) return candidate;
    }
    return '';
  })();

  const longStringFallback = findFirstLongString(merged);
  const usableFallback =
    longStringFallback && longStringFallback.trim().length > 0 && !isLikelyValidationText(longStringFallback)
      ? longStringFallback
      : '';
  const text = (bestDraftCandidate || usableFallback || '').trim() || undefined;

  const chaptersForDisplay = chaptersDerivedFromText(text || bestDraftCandidate || usableFallback || '');

  const validationNotesText = ensureString((merged as any).validation_notes);
  const canonUpdateText = ensureString((merged as any).canon_update);
  const balanceNotesText = ensureString((merged as any).balance_notes);

  const primaryAudience =
    ensureString((merged as any).primary_audience ?? (merged as any).primaryAudience ?? (work as any).primary_audience ?? (work as any).primaryAudience) ||
    ensureString((merged as any).audience ?? (work as any).audience);
  const status = ensureString((merged as any).status ?? (work as any).status);
  const intendedFormats = asStringList((merged as any).intended_formats ?? (merged as any).intendedFormats ?? (work as any).intended_formats ?? (work as any).intendedFormats);

  const hasAnyBody = Boolean(summary) || keyPoints.length > 0 || outline.length > 0 || toc.length > 0 || Boolean(text);
  const metaLine = [deliverableLower || docTypeLower].filter(Boolean).join(' • ');

  const sourcesUsed = asStringList((merged as any).sources_used);
  const assumptions = asStringList((merged as any).assumptions);
  const canonAlignmentScore = (merged as any).canon_alignment_score;
  const logicScore = (merged as any).logic_score;
  const conflicts = ensureArray((merged as any).conflicts, (c) => c);
  const proposals = ensureArray((merged as any).proposals, (p) => p);
  const physicsIssues = ensureArray((merged as any).physics_issues, (p) => p);

  const hasValidationSection =
    Boolean(validationNotesText) ||
    Boolean(canonUpdateText) ||
    Boolean(balanceNotesText) ||
    typeof canonAlignmentScore === 'number' ||
    typeof logicScore === 'number' ||
    conflicts.length > 0 ||
    proposals.length > 0 ||
    physicsIssues.length > 0 ||
    Boolean(validatorOutputText);

  const wordCount = (() => {
    if (!text) return 0;
    return text
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean).length;
  })();
  const readingTimeMinutes = wordCount > 0 ? Math.max(1, Math.round(wordCount / 200)) : 0;

  const chaptersFromHeadings = (() => {
    if (!text) return [] as Array<{ title: string; body: string }>;
    const lines = String(text || '').split(/\r?\n/);

    const out: Array<{ title: string; body: string }> = [];
    let currentTitle = '';
    let bodyLines: string[] = [];

    const push = () => {
      const body = bodyLines.join('\n').trim();
      const nextTitle = currentTitle.trim();
      if (!nextTitle && !body) return;
      out.push({ title: nextTitle || 'Untitled', body });
    };

    for (const line of lines) {
      const heading = line.match(/^#\s+(.+?)\s*$/);
      if (heading) {
        push();
        currentTitle = String(heading[1] ?? '').trim();
        bodyLines = [];
        continue;
      }
      bodyLines.push(line);
    }

    push();
    return out.filter((entry) => entry.title.trim().length > 0 || entry.body.trim().length > 0);
  })();

  const useHeadingChapters = chaptersForDisplay.length === 0 && chaptersFromHeadings.length > 1;

  const navItems: Array<{ id: string; label: string; available: boolean }> = [
    { id: `${prefix}-summary`, label: 'Summary', available: Boolean(summary) },
    { id: `${prefix}-chapters`, label: 'Chapters', available: chaptersForDisplay.length > 0 || useHeadingChapters },
    { id: `${prefix}-key-points`, label: 'Key Points', available: keyPoints.length > 0 },
    { id: `${prefix}-outline`, label: 'Outline', available: outline.length > 0 },
    { id: `${prefix}-toc`, label: 'TOC', available: toc.length > 0 },
    { id: `${prefix}-draft`, label: 'Text', available: Boolean(text) && !useHeadingChapters },
    { id: `${prefix}-validation`, label: 'Validation', available: hasValidationSection },
    { id: `${prefix}-structured`, label: 'Structured', available: !hasAnyBody },
  ];

  const availableNavItems = navItems.filter((item) => item.available);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
        {(genre || tone || metaLine || wordCount > 0) && (
          <p className="text-xs text-gray-500">
            {genre && <span className="mr-3">Genre: {genre}</span>}
            {tone && <span className="mr-3">Tone: {tone}</span>}
            {metaLine && <span>Type: {metaLine}</span>}
            {wordCount > 0 && (
              <span className={metaLine ? 'ml-3' : undefined}>
                {wordCount.toLocaleString()} words
                {readingTimeMinutes > 0 ? ` • ~${readingTimeMinutes} min read` : ''}
              </span>
            )}
          </p>
        )}
        {(primaryAudience || status || intendedFormats.length > 0) && (
          <p className="text-xs text-gray-500">
            {primaryAudience && <span className="mr-3">Audience: {primaryAudience}</span>}
            {status && <span className="mr-3">Status: {status}</span>}
            {intendedFormats.length > 0 && <span>Formats: {intendedFormats.join(', ')}</span>}
          </p>
        )}
      </header>

      {availableNavItems.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {availableNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollTo(item.id)}
              className="px-2.5 py-1 text-xs rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {summary && (
        <details id={`${prefix}-summary`} open className="mb-6">
          <summary className="cursor-pointer text-lg font-semibold text-gray-900 select-none">Summary</summary>
          <div className="mt-2 space-y-2 text-sm text-gray-800">
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{summary}</p>
          </div>
        </details>
      )}

      {(chaptersForDisplay.length > 0 || useHeadingChapters) && (
        <details id={`${prefix}-chapters`} open className="mb-6">
          <summary className="cursor-pointer text-lg font-semibold text-gray-900 select-none">Chapters</summary>
          <div className="mt-2 space-y-3">
            {useHeadingChapters
              ? chaptersFromHeadings.map((ch, idx) => (
                  <details key={`${ch.title}-${idx}`} open={idx === 0} className="border border-gray-200 rounded-md p-3">
                    <summary className="cursor-pointer select-none font-medium text-gray-900">{ch.title}</summary>
                    <div className="mt-2 space-y-2 text-sm text-gray-800">
                      <div className="bg-gray-50 border border-gray-200 rounded-md p-3">{renderDocumentText(ch.body)}</div>
                    </div>
                  </details>
                ))
              : chaptersForDisplay.map((ch, idx) => (
                  <details key={`${ch.title}-${idx}`} className="border border-gray-200 rounded-md p-3">
                    <summary className="cursor-pointer select-none font-medium text-gray-900">{ch.title}</summary>
                    <div className="mt-2 space-y-2 text-sm text-gray-800">
                      {ch.summary && <div className="text-sm text-gray-700 whitespace-pre-wrap">{ch.summary}</div>}
                      {ch.keyPoints.length > 0 && (
                        <div>
                          <div className="text-sm font-medium text-gray-900">Key Points</div>
                          {renderList(ch.keyPoints, 'No key points provided.')}
                        </div>
                      )}
                      {ch.draftText && (
                        <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                          {renderDocumentText(ch.draftText)}
                        </div>
                      )}
                    </div>
                  </details>
                ))}
          </div>
        </details>
      )}

      {keyPoints.length > 0 && (
        <details id={`${prefix}-key-points`} open className="mb-6">
          <summary className="cursor-pointer text-lg font-semibold text-gray-900 select-none">Key Points</summary>
          <div className="mt-2 space-y-2 text-sm text-gray-800">
          {renderList(keyPoints, 'No key points provided.')}
          </div>
        </details>
      )}

      {outline.length > 0 && (
        <details id={`${prefix}-outline`} open className="mb-6">
          <summary className="cursor-pointer text-lg font-semibold text-gray-900 select-none">Outline</summary>
          <div className="mt-2 space-y-2 text-sm text-gray-800">
          {renderList(outline, 'No outline provided.')}
          </div>
        </details>
      )}

      {toc.length > 0 && (
        <details id={`${prefix}-toc`} className="mb-6">
          <summary className="cursor-pointer text-lg font-semibold text-gray-900 select-none">Table of Contents</summary>
          <div className="mt-2 space-y-2 text-sm text-gray-800">
          {renderList(toc, 'No table of contents provided.')}
          </div>
        </details>
      )}

      {text && !useHeadingChapters && (
        <div id={`${prefix}-draft`} className="mb-6">
          <div className="text-lg font-semibold text-gray-900">Text</div>
          <div className="mt-2 space-y-2 text-sm text-gray-800">
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4">{renderDocumentText(text)}</div>
          </div>
        </div>
      )}

      {hasValidationSection && (
        <details id={`${prefix}-validation`} className="mb-6">
          <summary className="cursor-pointer text-lg font-semibold text-gray-900 select-none">Validation & Canon</summary>
          <div className="mt-2 space-y-4 text-sm text-gray-800">
            {validatorOutputText && (
              <div>
                <div className="text-sm font-medium text-gray-900">Validator Output</div>
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3">{renderDocumentText(validatorOutputText)}</div>
              </div>
            )}
            {(typeof canonAlignmentScore === 'number' || typeof logicScore === 'number') && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-700">
                {typeof canonAlignmentScore === 'number' && (
                  <div>
                    <span className="text-gray-500">Canon alignment:</span>{' '}
                    <span className="font-medium text-gray-900">{canonAlignmentScore}</span>
                  </div>
                )}
                {typeof logicScore === 'number' && (
                  <div>
                    <span className="text-gray-500">Logic score:</span>{' '}
                    <span className="font-medium text-gray-900">{logicScore}</span>
                  </div>
                )}
              </div>
            )}

            {sourcesUsed.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-900">Sources Used</div>
                {renderList(sourcesUsed, 'No sources listed.')}
              </div>
            )}

            {assumptions.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-900">Assumptions</div>
                {renderList(assumptions, 'No assumptions listed.')}
              </div>
            )}

            {canonUpdateText && (
              <div>
                <div className="text-sm font-medium text-gray-900">Canon Update Notes</div>
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 whitespace-pre-wrap">{canonUpdateText}</div>
              </div>
            )}

            {validationNotesText && (
              <div>
                <div className="text-sm font-medium text-gray-900">Validation Notes</div>
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 whitespace-pre-wrap">{validationNotesText}</div>
              </div>
            )}

            {balanceNotesText && (
              <div>
                <div className="text-sm font-medium text-gray-900">Balance Notes</div>
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 whitespace-pre-wrap">{balanceNotesText}</div>
              </div>
            )}

            {physicsIssues.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-900">Physics Issues</div>
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 whitespace-pre-wrap font-mono text-xs">
                  {JSON.stringify(physicsIssues, null, 2)}
                </div>
              </div>
            )}

            {conflicts.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-900">Conflicts</div>
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 whitespace-pre-wrap font-mono text-xs">
                  {JSON.stringify(conflicts, null, 2)}
                </div>
              </div>
            )}

            {proposals.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-900">Proposals</div>
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 whitespace-pre-wrap font-mono text-xs">
                  {JSON.stringify(proposals, null, 2)}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {!hasAnyBody && (
        <details id={`${prefix}-structured`} open className="mb-6">
          <summary className="cursor-pointer text-lg font-semibold text-gray-900 select-none">Structured Draft</summary>
          <div className="mt-2 space-y-2 text-sm text-gray-800">
          <div className="border border-gray-200 rounded-md divide-y divide-gray-200">
            {summarizeStructuredDraft(merged).map((row) => (
              <div key={row.key} className="flex flex-col md:flex-row md:items-start gap-1 md:gap-3 p-3">
                <div className="text-xs font-medium text-gray-600 md:w-48">{row.key}</div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap break-words flex-1">{row.value}</div>
              </div>
            ))}
          </div>
          </div>
        </details>
      )}
    </article>
  );
};

interface NormalizedStoryArc {
  title: string;
  synopsis: string;
  theme?: string;
  setting?: string;
  acts: string[];
  beats: string[];
  characters: StoryArcCharacter[];
}

const asStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) return ensureStringArray(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const parts = trimmed
      .split(/\r?\n|,|;|\u2022|\u00b7/)
      .map((part) => part.replace(/^[-*\d.\s]+/, '').trim())
      .filter((part) => part.length > 0);
    return parts;
  }
  return [];
};

const asNormalizedStoryArc = (record: PrimitiveRecord): NormalizedStoryArc => {
  const arc = asRecord(record.story_arc || record.storyArc || record.arc || record);

  const characters = ensureArray(arc.characters || record.characters, (entry) => {
    const obj = asRecord(entry);
    const name = ensureString(obj.name);
    const role = ensureString(obj.role) || ensureString(obj.function);
    const motivationSource = ensureObject(obj.motivation);
    const barriers = ensureObject(obj.barriers);

    const goals = ensureArray(obj.goals || obj.targets || obj.objectives, (goal) => {
      const goalObj = ensureObject(goal);
      const target = ensureString(goalObj.target) || ensureString(goalObj.goal) || ensureString(goalObj.name);
      const result = ensureString(goalObj.achievement) || ensureString(goalObj.outcome) || ensureString(goalObj.success);
      const combined = [target, result].filter(Boolean).join(' - ');
      return combined.length ? combined : undefined;
    });

    if (!name && !role && goals.length === 0) return undefined;

    return {
      name: name || 'Unnamed Character',
      role: role || undefined,
      motivation: {
        purpose:
          ensureString(motivationSource.purpose) ||
          ensureString(obj.motivation_purpose) ||
          ensureString(obj.purpose) ||
          undefined,
        reason:
          ensureString(motivationSource.reason) ||
          ensureString(obj.motivation_reason) ||
          ensureString(obj.reason) ||
          undefined,
      },
      goals,
      knownBarriers: ensureStringArray(obj.known_barriers || barriers.known || obj.barriers_known || obj.obstacles),
      unknownBarriers: ensureStringArray(obj.unknown_barriers || barriers.unknown || obj.barriers_unknown || obj.risks),
    };
  });

  return {
    title: ensureString(arc.title) || ensureString(record.title) || 'Untitled Story Arc',
    synopsis: ensureString(arc.synopsis) || ensureString(arc.summary) || ensureString(record.synopsis) || ensureString(record.summary),
    theme: ensureString(arc.theme) || ensureString(record.theme) || undefined,
    setting: ensureString(arc.setting) || ensureString(record.setting) || undefined,
    acts: ensureStringArray(arc.acts || record.acts),
    beats: ensureStringArray(arc.beats || arc.milestones || record.beats || record.milestones),
    characters,
  };
};

const inferType = (record: PrimitiveRecord, deliverable?: string): ContentType => inferNpcType(record, deliverable);

const asNormalizedNonfiction = (record: PrimitiveRecord, deliverable?: string): NormalizedNonfiction => {
  const draft = ensureObject(record.draft);
  const source: PrimitiveRecord = Object.keys(draft).length ? { ...record, ...draft } : record;

  const title =
    ensureString(source.title) ||
    ensureString(source.working_title) ||
    ensureString(source.work_title) ||
    ensureString(source.workTitle) ||
    ensureString(record.title) ||
    ensureString(record.working_title) ||
    (deliverable ? `${deliverable}` : 'Non-Fiction');

  const outlineValue = source.outline ?? source.structure ?? source.outline_structure ?? source.outlineStructure;
  const outline = Array.isArray(outlineValue)
    ? ensureStringArray(outlineValue)
    : typeof outlineValue === 'string'
      ? outlineValue
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
      : [];

  const chapters = ensureArray<NonfictionChapter>(source.chapters, (chapter) => {
    const obj = ensureObject(chapter);
    const chapterTitle = ensureString(obj.title);
    const summary = ensureString(obj.summary);
    const keyPoints = ensureStringArray(obj.key_points ?? obj.keyPoints);
    const draftText = ensureString(obj.draft_text ?? obj.draftText);

    if (!chapterTitle && !summary && keyPoints.length === 0 && !draftText) return undefined;

    return {
      title: chapterTitle || 'Untitled Chapter',
      summary: summary || undefined,
      keyPoints,
      draftText: draftText || undefined,
    };
  });

  return {
    title,
    subtitle: ensureString(source.subtitle) || undefined,
    medium: ensureString(source.medium) || undefined,
    genre: ensureString(source.genre) || undefined,
    tone: ensureString(source.tone) || undefined,
    primaryAudience:
      ensureString(
        source.primary_audience ??
          source.primaryAudience ??
          source.audience ??
          source.target_audience ??
          source.targetAudience,
      ) || undefined,
    authorRole: ensureString(source.author_role ?? source.authorRole) || undefined,
    authorNamePolicy: ensureString(source.author_name_policy ?? source.authorNamePolicy) || undefined,
    status: ensureString(source.status) || undefined,
    intendedFormats: asStringList(source.intended_formats ?? source.intendedFormats),
    dedication: asStringList(source.dedication),
    keywords: asStringList(source.keywords),
    purpose: ensureString(source.purpose ?? source.mission ?? source.premise) || undefined,
    thesis: ensureString(source.thesis ?? source.central_thesis ?? source.centralThesis) || undefined,
    outline,
    tableOfContents: asStringList(source.table_of_contents ?? source.tableOfContents),
    formattedManuscript:
      ensureString(source.formatted_manuscript ?? source.formattedManuscript) ||
      ensureString(record.formatted_manuscript ?? record.formattedManuscript) ||
      undefined,
    chapters,
  };
};

const renderDocumentText = (text: string): ReactNode => {
  const lines = text.split(/\r?\n/);
  const nodes: ReactNode[] = [];

  let index = 0;
  let key = 0;
  const pushSpacer = () => {
    nodes.push(<div key={`spacer-${key++}`} className="h-3" />);
  };

  while (index < lines.length) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      index += 1;
      if (nodes.length > 0) pushSpacer();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      if (level <= 2) {
        nodes.push(
          <h3 key={`h-${key++}`} className="text-lg font-semibold text-gray-900">
            {title}
          </h3>,
        );
      } else {
        nodes.push(
          <h4 key={`h-${key++}`} className="text-base font-semibold text-gray-900">
            {title}
          </h4>,
        );
      }

      index += 1;
      continue;
    }

    const isBullet = /^[-*]\s+/.test(trimmed);
    const isNumbered = /^\d+\.|^\d+\)/.test(trimmed);
    if (isBullet || isNumbered) {
      const items: string[] = [];
      const ordered = isNumbered;

      while (index < lines.length) {
        const candidate = lines[index].trim();
        if (!candidate) break;
        const bulletCandidate = /^[-*]\s+/.test(candidate);
        const numberedCandidate = /^\d+\.|^\d+\)/.test(candidate);
        if ((ordered && !numberedCandidate) || (!ordered && !bulletCandidate)) break;

        items.push(candidate.replace(/^([-*]|\d+\.|\d+\))\s+/, '').trim());
        index += 1;
      }

      if (ordered) {
        nodes.push(
          <ol key={`ol-${key++}`} className="list-decimal list-inside space-y-1 text-sm text-gray-800">
            {items.map((item, i) => (
              <li key={`oli-${key}-${i}`}>{item}</li>
            ))}
          </ol>,
        );
      } else {
        nodes.push(
          <ul key={`ul-${key++}`} className="list-disc list-inside space-y-1 text-sm text-gray-800">
            {items.map((item, i) => (
              <li key={`uli-${key}-${i}`}>{item}</li>
            ))}
          </ul>,
        );
      }
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const candidateRaw = lines[index];
      const candidate = candidateRaw.trim();
      if (!candidate) break;
      if (/^(#{1,6})\s+/.test(candidate)) break;
      if (/^[-*]\s+/.test(candidate) || /^\d+\.|^\d+\)/.test(candidate)) break;
      paragraphLines.push(candidateRaw.trimEnd());
      index += 1;
    }

    const paragraph = paragraphLines.join(' ').trim();
    if (paragraph) {
      nodes.push(
        <p key={`p-${key++}`} className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
          {paragraph}
        </p>,
      );
    }
  }

  return <div className="space-y-2">{nodes}</div>;
};

const Section = ({ title, children }: { title: string; children: ReactNode }) => {
  if (children === null || children === undefined) return null;
  if (typeof children === 'string' && !children.trim()) return null;

  return (
    <section className="mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <div className="space-y-2 text-sm text-gray-800">{children}</div>
    </section>
  );
};

const renderList = (items: string[], empty = 'None provided.') => {
  if (!items.length) return <p className="text-sm text-gray-500">{empty}</p>;
  return (
    <ul className="list-disc list-inside space-y-1 text-sm text-gray-800">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
};

const looksLikeJsonString = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return true;
  return false;
};

const findFirstLongString = (value: unknown): string | undefined => {
  const record = ensureObject(value);
  const keys = Object.keys(record);
  for (const key of keys) {
    const entry = (record as any)[key];
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed.length >= 180 && !looksLikeJsonString(trimmed)) return trimmed;
    }
  }
  return undefined;
};

const summarizeStructuredDraft = (record: PrimitiveRecord): Array<{ key: string; value: string }> => {
  const entries: Array<{ key: string; value: string }> = [];
  for (const key of Object.keys(record)) {
    const value = (record as any)[key];
    if (value === null || value === undefined) continue;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) continue;
      entries.push({ key, value: trimmed.length > 220 ? `${trimmed.slice(0, 220)}…` : trimmed });
      continue;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      entries.push({ key, value: String(value) });
      continue;
    }

    if (Array.isArray(value)) {
      entries.push({ key, value: `Array(${value.length})` });
      continue;
    }

    if (typeof value === 'object') {
      entries.push({ key, value: `Object(${Object.keys(value as Record<string, unknown>).length})` });
      continue;
    }
  }
  return entries.slice(0, 28);
};

const StoryArcRenderer = ({ content }: { content: NormalizedStoryArc }) => (
  <article className="space-y-6">
    <header>
      <h2 className="text-2xl font-bold text-gray-900">{content.title}</h2>
      {(content.theme || content.setting) && (
        <p className="text-sm text-gray-600">
          {content.theme && <span className="mr-4">Theme: {content.theme}</span>}
          {content.setting && <span>Setting: {content.setting}</span>}
        </p>
      )}
    </header>

    <Section title="Synopsis">
      <p>{content.synopsis || 'No synopsis provided.'}</p>
    </Section>

    <Section title="Acts">{renderList(content.acts, 'No acts provided.')}</Section>

    <Section title="Story Beats">{renderList(content.beats, 'No beats provided.')}</Section>

    <Section title="Characters">
      {!content.characters.length ? (
        <p className="text-sm text-gray-500">No characters provided.</p>
      ) : (
        <div className="space-y-4">
          {content.characters.map((character, index) => (
            <div key={`${character.name}-${index}`} className="border border-gray-200 rounded-md p-4 space-y-2">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">{character.name}</h4>
                {character.role && <p className="text-sm text-gray-600">Role: {character.role}</p>}
              </div>
              {character.motivation && (character.motivation.purpose || character.motivation.reason) && (
                <div className="text-sm text-gray-700">
                  <p className="font-medium">Motivation</p>
                  {character.motivation.purpose && <p>Purpose: {character.motivation.purpose}</p>}
                  {character.motivation.reason && <p>Reason: {character.motivation.reason}</p>}
                </div>
              )}
              {character.goals.length > 0 && (
                <div>
                  <p className="font-medium text-sm text-gray-900">Goals</p>
                  {renderList(character.goals, 'No goals listed.')}
                </div>
              )}
              {character.knownBarriers.length > 0 && (
                <div>
                  <p className="font-medium text-sm text-gray-900">Known Barriers</p>
                  {renderList(character.knownBarriers, 'None listed.')}
                </div>
              )}
              {character.unknownBarriers.length > 0 && (
                <div>
                  <p className="font-medium text-sm text-gray-900">Unknown Barriers</p>
                  {renderList(character.unknownBarriers, 'None listed.')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  </article>
);

const GenericRenderer = ({ content }: { content: PrimitiveRecord }) => (
  <pre className="bg-gray-50 border border-gray-200 rounded-md p-4 text-sm whitespace-pre-wrap text-gray-800">
    {JSON.stringify(content, null, 2)}
  </pre>
);

const NonfictionRenderer = ({ content, raw }: { content: NormalizedNonfiction; raw: PrimitiveRecord }) => {
  const hasOverview =
    Boolean(content.genre) ||
    Boolean(content.tone) ||
    Boolean(content.primaryAudience) ||
    Boolean(content.authorRole) ||
    Boolean(content.authorNamePolicy) ||
    Boolean(content.status) ||
    content.intendedFormats.length > 0 ||
    content.dedication.length > 0;

  const hasBody =
    hasOverview ||
    Boolean(content.purpose) ||
    Boolean(content.thesis) ||
    content.keywords.length > 0 ||
    content.outline.length > 0 ||
    content.tableOfContents.length > 0 ||
    Boolean(content.formattedManuscript) ||
    content.chapters.length > 0;

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">{content.title}</h2>
        {content.subtitle && <p className="text-sm text-gray-600">{content.subtitle}</p>}
        {content.medium && <p className="text-sm text-gray-600">Medium: {content.medium}</p>}
      </header>

      {hasOverview && (
        <Section title="Overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {content.genre && (
              <div>
                <span className="text-gray-600">Genre:</span>
                <span className="ml-2 font-medium text-gray-900">{content.genre}</span>
              </div>
            )}
            {content.tone && (
              <div>
                <span className="text-gray-600">Tone:</span>
                <span className="ml-2 font-medium text-gray-900">{content.tone}</span>
              </div>
            )}
            {content.primaryAudience && (
              <div className="md:col-span-2">
                <span className="text-gray-600">Primary Audience:</span>
                <span className="ml-2 font-medium text-gray-900">{content.primaryAudience}</span>
              </div>
            )}
            {content.authorRole && (
              <div>
                <span className="text-gray-600">Author Role:</span>
                <span className="ml-2 font-medium text-gray-900">{content.authorRole}</span>
              </div>
            )}
            {content.authorNamePolicy && (
              <div>
                <span className="text-gray-600">Author Name Policy:</span>
                <span className="ml-2 font-medium text-gray-900">{content.authorNamePolicy}</span>
              </div>
            )}
            {content.status && (
              <div>
                <span className="text-gray-600">Status:</span>
                <span className="ml-2 font-medium text-gray-900">{content.status}</span>
              </div>
            )}
            {content.intendedFormats.length > 0 && (
              <div className="md:col-span-2">
                <span className="text-gray-600">Intended Formats:</span>
                <span className="ml-2 font-medium text-gray-900">{content.intendedFormats.join(', ')}</span>
              </div>
            )}
          </div>
          {content.dedication.length > 0 && (
            <div className="mt-3">
              <p className="font-medium text-sm text-gray-900">Dedication</p>
              {renderList(content.dedication, 'No dedication provided.')}
            </div>
          )}
        </Section>
      )}

      {content.purpose && (
        <Section title="Purpose">
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{content.purpose}</p>
        </Section>
      )}

      {content.thesis && (
        <Section title="Thesis">
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{content.thesis}</p>
        </Section>
      )}

      {content.keywords.length > 0 && (
        <Section title="Keywords">{renderList(content.keywords, 'No keywords provided.')}</Section>
      )}

      {content.outline.length > 0 && (
        <Section title="Outline">{renderList(content.outline, 'No outline provided.')}</Section>
      )}

      {content.tableOfContents.length > 0 && (
        <Section title="Table of Contents">{renderList(content.tableOfContents, 'No table of contents provided.')}</Section>
      )}

      {content.formattedManuscript && (
        <Section title="Manuscript">
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
            {renderDocumentText(content.formattedManuscript)}
          </div>
        </Section>
      )}

      {!content.formattedManuscript && content.chapters.length > 0 && (
        <Section title="Chapters">
          <div className="space-y-4">
            {content.chapters.map((chapter, index) => (
              <div key={`${chapter.title}-${index}`} className="border border-gray-200 rounded-md p-4 space-y-2">
                <h4 className="text-lg font-semibold text-gray-900">{chapter.title}</h4>
                {chapter.summary && <p className="text-sm text-gray-700 whitespace-pre-wrap">{chapter.summary}</p>}
                {chapter.keyPoints.length > 0 && (
                  <div>
                    <p className="font-medium text-sm text-gray-900">Key Points</p>
                    {renderList(chapter.keyPoints, 'No key points provided.')}
                  </div>
                )}
                {chapter.draftText && (
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                    {renderDocumentText(chapter.draftText)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {!hasBody && <GenericRenderer content={raw} />}
    </article>
  );
};

export default function ContentRenderer({ content, deliverable }: ContentRendererProps) {
  const record = asRecord(content);
  if (Object.keys(record).length === 0) return null;

  const draft = ensureObject(record.draft);
  const mergedForSignals: PrimitiveRecord = Object.keys(draft).length ? { ...record, ...draft } : record;

  const deliverableValue =
    ensureString(deliverable) ||
    ensureString(record.deliverable) ||
    ensureString(ensureObject(record.draft).deliverable);

  const deliverableLower = deliverableValue.toLowerCase();
  const domainValue =
    ensureString(mergedForSignals.domain) ||
    ensureString(ensureObject(mergedForSignals.flags).domain) ||
    ensureString(ensureObject(mergedForSignals.config).domain);
  const isWritingDomain = domainValue.toLowerCase() === 'writing';

  const hasFormattedManuscript = Boolean(
    ensureString(mergedForSignals.formatted_manuscript ?? mergedForSignals.formattedManuscript),
  );
  const hasNonfictionSignals =
    Boolean(ensureString(mergedForSignals.working_title ?? mergedForSignals.work_title ?? mergedForSignals.workTitle)) ||
    Boolean(ensureString(mergedForSignals.subtitle)) ||
    Boolean(ensureString(mergedForSignals.thesis ?? mergedForSignals.central_thesis ?? mergedForSignals.centralThesis)) ||
    Boolean(ensureString(mergedForSignals.primary_audience ?? mergedForSignals.primaryAudience)) ||
    Boolean(ensureString(mergedForSignals.author_role ?? mergedForSignals.authorRole)) ||
    Boolean(ensureString(mergedForSignals.author_name_policy ?? mergedForSignals.authorNamePolicy)) ||
    asStringList(mergedForSignals.intended_formats ?? mergedForSignals.intendedFormats).length > 0 ||
    asStringList(mergedForSignals.table_of_contents ?? mergedForSignals.tableOfContents).length > 0 ||
    asStringList(mergedForSignals.outline ?? mergedForSignals.structure ?? mergedForSignals.outline_structure).length > 0 ||
    Boolean(
      Array.isArray(mergedForSignals.chapters) && (mergedForSignals.chapters as unknown[]).length > 0,
    );

  const isNonfiction =
    deliverableLower === 'nonfiction' ||
    deliverableLower.includes('nonfiction') ||
    hasFormattedManuscript ||
    (isWritingDomain && hasNonfictionSignals);

  if (isNonfiction) {
    return <NonfictionRenderer content={asNormalizedNonfiction(record, deliverableValue)} raw={record} />;
  }

  const writingDeliverableTokens = [
    'chapter',
    'outline',
    'foreword',
    'prologue',
    'epilogue',
    'scene',
    'section',
    'journal',
    'diary',
    'memoir',
    'log',
    'diet',
    'entry',
    'manuscript',
  ];

  const typeLower = ensureString(mergedForSignals.type ?? (mergedForSignals as any).content_type ?? (mergedForSignals as any).contentType).toLowerCase();
  const hasWorkObject = Object.keys(ensureObject((mergedForSignals as any).work)).length > 0;
  const hasWritingDeliverable = writingDeliverableTokens.some((token) => deliverableLower.includes(token));
  const hasWritingType = writingDeliverableTokens.some((token) => typeLower.includes(token));

  const hasRpgSignals =
    Boolean((mergedForSignals as any).stat_block) ||
    Boolean((mergedForSignals as any).ability_scores) ||
    Boolean((mergedForSignals as any).armor_class) ||
    Boolean((mergedForSignals as any).hit_points) ||
    Boolean((mergedForSignals as any).challenge_rating) ||
    Boolean((mergedForSignals as any).npc) ||
    Boolean((mergedForSignals as any).monster);

  const shouldRenderWriting = !hasRpgSignals && (isWritingDomain || hasWorkObject || hasWritingDeliverable || hasWritingType);

  if (shouldRenderWriting) {
    return <WritingRenderer raw={record} />;
  }

  const type = inferType(record, deliverable);

  if (type === ContentType.STORY_ARC) {
    return <StoryArcRenderer content={asNormalizedStoryArc(record)} />;
  }

  if (type === ContentType.CHARACTER) {
    return <NpcContentView npc={normalizeNpc(record)} />;
  }

  if (type === ContentType.LOCATION) {
    return <LocationContentView location={record as any} />;
  }

  return <GenericRenderer content={record} />;
}
