/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Code, FileText, Pencil, Save, AlertCircle, Copy, Tag, Wand2, Volume2, Play, Pause, Square, Mic } from 'lucide-react';
import ContentRenderer from './ContentRenderer';

type SpeechRecognitionResultAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionResultAlternativeLike;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
  message?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface WritingReaderModalProps {
  isOpen: boolean;
  title: string;
  content: unknown;
  rawText?: string;
  initialMetadata?: Record<string, unknown>;
  deliverable?: string;
  initialMode?: 'formatted' | 'raw' | 'edit';
  onClose: () => void;
  onSave?: (update: { title: string; content: string; metadata?: Record<string, unknown> }) => Promise<void> | void;
}

export default function WritingReaderModal({
  isOpen,
  title,
  content,
  rawText,
  initialMetadata,
  deliverable,
  initialMode,
  onClose,
  onSave,
}: WritingReaderModalProps) {
  const [viewMode, setViewMode] = useState<'formatted' | 'raw' | 'edit'>('formatted');
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftText, setDraftText] = useState(rawText ?? '');
  const [draftStatus, setDraftStatus] = useState('');
  const [draftTagsText, setDraftTagsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showRefinePanel, setShowRefinePanel] = useState(false);
  const [showAudioPanel, setShowAudioPanel] = useState(true);
  const [refineSection, setRefineSection] = useState<'draft' | 'summary' | 'outline' | 'chapter'>('draft');
  const [refineChapterTitle, setRefineChapterTitle] = useState('');
  const [refineGoal, setRefineGoal] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [refineResult, setRefineResult] = useState('');

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const [findQuery, setFindQuery] = useState('');
  const [findPos, setFindPos] = useState<number | null>(null);
  const [jumpHeadingIndex, setJumpHeadingIndex] = useState<number | ''>('');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [dictationSupported, setDictationSupported] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [dictationInterim, setDictationInterim] = useState('');
  const [dictationError, setDictationError] = useState<string | null>(null);

  const [ttsSupported, setTtsSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState('');
  const [ttsRate, setTtsRate] = useState(1);
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const [ttsPaused, setTtsPaused] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);

  const ttsQueueRef = useRef<string[]>([]);
  const ttsIndexRef = useRef(0);
  const ttsSessionIdRef = useRef(0);
  const ttsWatchdogRef = useRef<number | null>(null);

  const safeTitle = useMemo(() => {
    const trimmed = String(title || '').trim();
    return trimmed.length ? trimmed : 'Document';
  }, [title]);

  const canEdit = Boolean(onSave) && typeof rawText === 'string';

  const pickDefaultVoiceURI = (available: SpeechSynthesisVoice[]): string => {
    if (!available.length) return '';

    const byExactName = available.find((v) => v.name === 'Google UK English Female');
    if (byExactName) return byExactName.voiceURI;

    const byName = available.find((v) => /google uk english female/i.test(v.name));
    if (byName) return byName.voiceURI;

    const enGb = available.filter((v) => String(v.lang || '').toLowerCase().startsWith('en-gb'));
    const googleEnGb = enGb.find((v) => /google/i.test(v.name));
    if (googleEnGb) return googleEnGb.voiceURI;
    if (enGb.length) return enGb[0].voiceURI;

    const navPrefix = (navigator.language || 'en').toLowerCase().slice(0, 2);
    const byNavigator = available.find((v) => v.lang?.toLowerCase().startsWith(navPrefix));
    return (byNavigator ?? available[0]).voiceURI;
  };

  const toSpeakableText = (input: string): string => {
    const base = String(input || '');
    if (!base.trim()) return '';

    const lines = base.split(/\r?\n/);
    const out: string[] = [];

    for (const rawLine of lines) {
      const line = String(rawLine ?? '');
      const trimmed = line.trim();
      if (!trimmed) {
        out.push('');
        continue;
      }

      const heading = trimmed.match(/^#{1,6}\s+(.+?)\s*$/);
      if (heading) {
        out.push(`${heading[1]}.`);
        out.push('');
        continue;
      }

      if (/^(!?\[.*?\]\(.*?\))$/.test(trimmed)) {
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        out.push('');
        continue;
      }

      let cleaned = trimmed;
      cleaned = cleaned.replace(/^>\s+/, '');
      cleaned = cleaned.replace(/^[-*+]\s+/, '');
      cleaned = cleaned.replace(/^\d+\.\s+/, '');
      cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
      cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
      cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
      cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
      cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
      cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
      cleaned = cleaned.replace(/_([^_]+)_/g, '$1');
      cleaned = cleaned.replace(/#+\s*/g, '');
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
      if (cleaned) out.push(cleaned);
    }

    return out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const getSpeechRecognitionCtor = (): SpeechRecognitionConstructor | null => {
    const win = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
  };

  const insertTextAtCursor = (transcript: string) => {
    const rawTranscript = String(transcript || '').trim();
    if (!rawTranscript) return;

    const el = editorRef.current;
    const start = el ? el.selectionStart : draftText.length;
    const end = el ? el.selectionEnd : draftText.length;

    setDraftText((prev) => {
      const safePrev = prev ?? '';
      const safeStart = typeof start === 'number' ? Math.max(0, Math.min(start, safePrev.length)) : safePrev.length;
      const safeEnd = typeof end === 'number' ? Math.max(safeStart, Math.min(end, safePrev.length)) : safePrev.length;
      const before = safePrev.slice(0, safeStart);
      const after = safePrev.slice(safeEnd);

      const needsLeadingSpace = before.length > 0 && !/\s$/.test(before) && !/^[\s.,!?;:)]/.test(rawTranscript);
      const needsTrailingSpace = after.length > 0 && !/^\s/.test(after) && !/[\s.,!?;:)]$/.test(rawTranscript);
      const insertion = `${needsLeadingSpace ? ' ' : ''}${rawTranscript}${needsTrailingSpace ? ' ' : ''}`;
      const next = `${before}${insertion}${after}`;

      const caret = safeStart + insertion.length;
      window.setTimeout(() => {
        const current = editorRef.current;
        if (!current) return;
        try {
          current.focus();
          current.setSelectionRange(caret, caret);
        } catch {
        }
      }, 0);

      return next;
    });
  };

  const stopDictation = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setDictating(false);
      setDictationInterim('');
      return;
    }
    try {
      recognition.stop();
    } catch {
      try {
        recognition.abort();
      } catch {
      }
    }
    setDictating(false);
    setDictationInterim('');
  };

  const startDictation = () => {
    if (viewMode !== 'edit') {
      setDictationError('Dictation is available in Edit mode.');
      return;
    }

    const ctor = getSpeechRecognitionCtor();
    if (!ctor) {
      setDictationError('Dictation is not supported in this browser.');
      return;
    }

    setDictationError(null);
    setDictationInterim('');

    const recognition = recognitionRef.current ?? new ctor();
    recognitionRef.current = recognition;
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const results = event?.results;
      const startIndex = typeof event?.resultIndex === 'number' ? event.resultIndex : 0;
      if (!results) return;

      let finalText = '';
      let interimText = '';

      for (let i = startIndex; i < results.length; i += 1) {
        const r = results[i];
        const t = r?.[0]?.transcript ? String(r[0].transcript) : '';
        if (!t.trim()) continue;
        if (r?.isFinal) {
          finalText += (finalText ? ' ' : '') + t.trim();
        } else {
          interimText += (interimText ? ' ' : '') + t.trim();
        }
      }

      setDictationInterim(interimText);
      if (finalText.trim()) insertTextAtCursor(finalText);
    };

    recognition.onerror = (event) => {
      const error = String(event?.error || event?.message || 'Dictation error');
      setDictationError(error);
      setDictating(false);
      setDictationInterim('');
    };

    recognition.onend = () => {
      setDictating(false);
      setDictationInterim('');
    };

    try {
      recognition.start();
      setDictating(true);
    } catch {
      setDictationError('Unable to start dictation.');
      setDictating(false);
    }
  };

  const stopTts = () => {
    if (!('speechSynthesis' in window)) return;
    ttsSessionIdRef.current += 1;
    ttsQueueRef.current = [];
    ttsIndexRef.current = 0;
    if (ttsWatchdogRef.current) {
      window.clearTimeout(ttsWatchdogRef.current);
      ttsWatchdogRef.current = null;
    }
    try {
      window.speechSynthesis.cancel();
    } catch {
    }
    setTtsSpeaking(false);
    setTtsPaused(false);
  };

  const splitForTts = (input: string, maxLen: number): string[] => {
    const text = String(input || '').replace(/\s+/g, ' ').trim();
    if (!text) return [];

    const parts: string[] = [];
    let remaining = text;

    while (remaining.length > maxLen) {
      const windowText = remaining.slice(0, maxLen + 1);
      let cut = Math.max(
        windowText.lastIndexOf('. '),
        windowText.lastIndexOf('! '),
        windowText.lastIndexOf('? '),
        windowText.lastIndexOf('; '),
        windowText.lastIndexOf(': '),
      );

      if (cut >= 0) cut += 1;
      if (cut < Math.floor(maxLen * 0.5)) {
        cut = windowText.lastIndexOf(' ');
      }
      if (cut < 40) cut = maxLen;

      const chunk = remaining.slice(0, cut).trim();
      if (chunk) parts.push(chunk);
      remaining = remaining.slice(cut).trim();
    }

    if (remaining.trim()) parts.push(remaining.trim());
    return parts;
  };

  const startTtsQueue = (chunks: string[]) => {
    if (!('speechSynthesis' in window)) return;
    if (chunks.length === 0) return;

    stopTts();

    const sessionId = ttsSessionIdRef.current + 1;
    ttsSessionIdRef.current = sessionId;
    ttsQueueRef.current = chunks;
    ttsIndexRef.current = 0;

    const preferred = voices.find((v) => v.voiceURI === voiceURI);
    const lang = preferred?.lang || navigator.language || 'en-US';
    const rate = Math.max(0.6, Math.min(1.4, Number(ttsRate) || 1));

    const speakNext = () => {
      if (ttsSessionIdRef.current !== sessionId) return;
      const idx = ttsIndexRef.current;
      const next = ttsQueueRef.current[idx];
      if (!next) {
        setTtsSpeaking(false);
        setTtsPaused(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(next);
      utterance.rate = rate;
      utterance.lang = lang;
      if (preferred) utterance.voice = preferred;

      if (ttsWatchdogRef.current) {
        window.clearTimeout(ttsWatchdogRef.current);
        ttsWatchdogRef.current = null;
      }

      utterance.onstart = () => {
        if (ttsSessionIdRef.current !== sessionId) return;
        if (ttsWatchdogRef.current) {
          window.clearTimeout(ttsWatchdogRef.current);
          ttsWatchdogRef.current = null;
        }
      };

      utterance.onend = () => {
        if (ttsSessionIdRef.current !== sessionId) return;
        ttsIndexRef.current += 1;
        speakNext();
      };

      utterance.onerror = (event) => {
        if (ttsSessionIdRef.current !== sessionId) return;
        const msg = typeof event?.error === 'string' && event.error ? `Read aloud failed: ${event.error}` : 'Read aloud failed.';
        setTtsError(msg);
        stopTts();
      };

      try {
        ttsWatchdogRef.current = window.setTimeout(() => {
          if (ttsSessionIdRef.current !== sessionId) return;
          const synth = window.speechSynthesis;
          if (!synth.speaking && !synth.pending) {
            setTtsError('Read aloud failed to start for the selected voice.');
            stopTts();
          }
        }, 900);

        window.speechSynthesis.speak(utterance);
      } catch {
        setTtsError('Unable to start read aloud.');
        stopTts();
      }
    };

    setTtsError(null);

    window.setTimeout(() => {
      if (ttsSessionIdRef.current !== sessionId) return;
      setTtsSpeaking(true);
      setTtsPaused(false);
      speakNext();
    }, 0);
  };

  const toggleTts = () => {
    if (!ttsSupported) {
      setTtsError('Read aloud is not supported in this browser.');
      return;
    }

    if (ttsSpeaking) {
      if (!('speechSynthesis' in window)) return;
      try {
        if (ttsPaused) {
          window.speechSynthesis.resume();
          setTtsPaused(false);
        } else {
          window.speechSynthesis.pause();
          setTtsPaused(true);
        }
      } catch {
      }
      return;
    }

    const source = viewMode === 'edit' ? draftText : (extractWritingContext.draft ?? '');
    const text = toSpeakableText(source);
    if (!text) {
      setTtsError('Nothing to read aloud.');
      return;
    }

    const chunks = splitForTts(text, 260);
    startTtsQueue(chunks);
  };

  const tagList = useMemo(() => {
    return draftTagsText
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }, [draftTagsText]);

  const extractWritingContext = useMemo(() => {
    const record = content && typeof content === 'object' && !Array.isArray(content) ? (content as Record<string, unknown>) : {};
    const draft = record.draft && typeof record.draft === 'object' && !Array.isArray(record.draft) ? (record.draft as Record<string, unknown>) : {};
    const merged: Record<string, unknown> = Object.keys(draft).length ? { ...record, ...draft } : record;

    const work = merged.work && typeof merged.work === 'object' && !Array.isArray(merged.work) ? (merged.work as Record<string, unknown>) : {};
    const chapter = merged.chapter && typeof merged.chapter === 'object' && !Array.isArray(merged.chapter) ? (merged.chapter as Record<string, unknown>) : {};

    const scene = merged.scene && typeof merged.scene === 'object' && !Array.isArray(merged.scene) ? (merged.scene as Record<string, unknown>) : {};
    const entry = merged.entry && typeof merged.entry === 'object' && !Array.isArray(merged.entry) ? (merged.entry as Record<string, unknown>) : {};

    const getStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const getList = (v: unknown): string[] => {
      if (Array.isArray(v)) return v.map(getStr).filter(Boolean);
      if (typeof v === 'string') {
        return v
          .split(/\r?\n|,|;|\u2022|\u00b7/)
          .map((part) => part.replace(/^[-*\d.\s]+/, '').trim())
          .filter(Boolean);
      }
      return [];
    };

    const summary =
      getStr(merged.summary) ||
      getStr(merged.synopsis) ||
      getStr(merged.abstract) ||
      getStr(chapter.summary);
    const outline = getList(merged['outline'] ?? merged['structure'] ?? merged['outline_structure']).join('\n');

    const genre = getStr(merged['genre']) || getStr(work['genre']);
    const tone = getStr(merged['tone']) || getStr(work['tone']);
    const audience =
      getStr(merged['primary_audience'] ?? merged['primaryAudience']) ||
      getStr(merged['audience']) ||
      getStr(work['primary_audience'] ?? work['primaryAudience']) ||
      getStr(work['audience']);

    const maybeJsonRaw = typeof rawText === 'string' ? rawText.trim() : '';
    const rawLooksJson = (() => {
      if (!maybeJsonRaw) return false;
      if (!(maybeJsonRaw.startsWith('{') || maybeJsonRaw.startsWith('['))) return false;
      try {
        JSON.parse(maybeJsonRaw);
        return true;
      } catch {
        return false;
      }
    })();

    const chaptersArray = (() => {
      const chapters =
        (Array.isArray(merged['chapters']) ? (merged['chapters'] as unknown[]) : []) ||
        (Array.isArray(work['chapters']) ? ((work['chapters'] as unknown[]) ?? []) : []);

      const getObj = (v: unknown): Record<string, unknown> =>
        v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

      return chapters
        .map((entry) => {
          const obj = getObj(entry);
          const nestedDraft = getObj(obj['draft']);
          const title = getStr(obj['title']) || getStr(obj['chapter_title'] ?? obj['chapterTitle']);

          const contentValue = obj['content'];
          const contentArray = Array.isArray(contentValue)
            ? (contentValue as unknown[])
                .map((line: unknown) => {
                  if (typeof line === 'string') return line.trim();
                  const lineObj = getObj(line);
                  return getStr(lineObj['text']) || getStr(lineObj['draft_text'] ?? lineObj['draftText']);
                })
                .filter((t: string) => t.length > 0)
            : [];

          const draftText =
            getStr(obj['draft_text'] ?? obj['draftText']) ||
            getStr(obj['chapter_text'] ?? obj['chapterText']) ||
            getStr(obj['text']) ||
            getStr(obj['body']) ||
            (typeof contentValue === 'string' ? getStr(contentValue) : '') ||
            (contentArray.length ? contentArray.join('\n\n') : '') ||
            getStr(nestedDraft['draft_text'] ?? nestedDraft['draftText']) ||
            getStr(nestedDraft['text']) ||
            getStr(nestedDraft['body']);

          if (!title && !draftText) return null;
          return {
            title: title || 'Untitled Chapter',
            draftText,
          };
        })
        .filter(Boolean) as Array<{ title: string; draftText: string }>;
    })();

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
      getStr(merged['formatted_text'] ?? merged['formattedText']),
      getStr(merged['formatted_manuscript'] ?? merged['formattedManuscript']),
      getStr(merged['draft_text'] ?? merged['draftText']),
      getStr(chapter['draft_text'] ?? chapter['draftText']),
      getStr(scene['draft_text'] ?? scene['draftText']),
      chaptersCombinedDraft,
      getStr(merged['body']),
      getStr(merged['text']),
      typeof merged['content'] === 'string' ? getStr(merged['content']) : '',
      Array.isArray(merged['content'])
        ? (merged['content'] as unknown[])
            .map((entry: unknown) => {
              if (typeof entry === 'string') return entry.trim();
              const entryObj = entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Record<string, unknown>) : {};
              return getStr(entryObj['text']);
            })
            .filter(Boolean)
            .join('\n\n')
        : '',
      getStr(entry['text']),
    ].filter((candidate) => candidate && candidate.trim().length > 0);

    const bestDraftCandidate = (() => {
      for (const candidate of draftCandidates) {
        if (!isLikelyValidationText(candidate)) return candidate;
      }
      return '';
    })();

    const draftTextForEdit = (() => {
      const raw = typeof rawText === 'string' ? rawText : '';
      if (raw.trim() && !rawLooksJson) return raw;
      return bestDraftCandidate;
    })();

    return {
      genre,
      tone,
      audience,
      summary,
      outline,
      draft: draftTextForEdit,
    };
  }, [content, rawText]);

  const formattedContentForDisplay = useMemo(() => {
    const baseRecord = content && typeof content === 'object' && !Array.isArray(content) ? (content as Record<string, unknown>) : {};
    const displayText = (extractWritingContext.draft ?? '').trim();
    if (!displayText) return content;
    return {
      ...baseRecord,
      title: safeTitle,
      domain: 'writing',
      deliverable,
      text: displayText,
      formatted_text: displayText,
    };
  }, [content, deliverable, extractWritingContext.draft]);

  const rawContentForDisplay = useMemo(() => {
    const raw = typeof rawText === 'string' ? rawText.trim() : '';
    if (!raw) return JSON.stringify(content, null, 2);
    if (!(raw.startsWith('{') || raw.startsWith('['))) return raw;
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }, [content, rawText]);

  const wordCount = useMemo(() => {
    const text =
      viewMode === 'edit'
        ? draftText
        : viewMode === 'formatted'
          ? (extractWritingContext.draft ?? '')
          : (typeof rawText === 'string' ? rawText : '');
    if (!text) return 0;
    return text
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean).length;
  }, [draftText, rawText, viewMode, extractWritingContext.draft]);
  const readingTimeMinutes = wordCount > 0 ? Math.max(1, Math.round(wordCount / 200)) : 0;

  const runFind = (direction: 'next' | 'prev') => {
    const query = findQuery.trim().toLowerCase();
    if (!query) return;
    const haystack = (draftText || '').toLowerCase();

    const from = findPos ?? 0;
    const start = direction === 'next' ? Math.max(0, from + query.length) : Math.max(0, from - 1);
    const idx = direction === 'next' ? haystack.indexOf(query, start) : haystack.lastIndexOf(query, start);

    if (idx < 0) return;
    setFindPos(idx);

    const el = editorRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(idx, idx + query.length);
  };

  const headings = useMemo(() => {
    const text = draftText || '';
    const matches: Array<{ index: number; level: number; title: string }> = [];
    const re = /^\s*(#{1,6})\s+(.+?)\s*$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const level = m[1]?.length ?? 0;
      const title = String(m[2] ?? '').trim();
      if (!title) continue;
      matches.push({ index: m.index, level, title });
    }
    return matches;
  }, [draftText]);

  const jumpTo = (index: number) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(index, index);
  };

  const extractChapters = useMemo(() => {
    const record = content && typeof content === 'object' && !Array.isArray(content) ? (content as Record<string, unknown>) : {};
    const draft = record.draft && typeof record.draft === 'object' && !Array.isArray(record.draft) ? (record.draft as Record<string, unknown>) : {};
    const merged: Record<string, unknown> = Object.keys(draft).length ? { ...record, ...draft } : record;
    const work = merged.work && typeof merged.work === 'object' && !Array.isArray(merged.work) ? (merged.work as Record<string, unknown>) : {};

    const getStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const getObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

    const chaptersSource: unknown[] =
      (Array.isArray(merged['chapters']) ? (merged['chapters'] as unknown[]) : []) ||
      (Array.isArray(work['chapters']) ? ((work['chapters'] as unknown[]) ?? []) : []);

    const chapters = chaptersSource
      .map((entry) => {
        const obj = getObj(entry);
        const nestedDraft = getObj(obj['draft']);
        const title = getStr(obj['title']) || getStr(obj['chapter_title'] ?? obj['chapterTitle']);

        const contentValue = obj['content'];
        const contentArray = Array.isArray(contentValue)
          ? (contentValue as unknown[])
              .map((line: unknown) => {
                if (typeof line === 'string') return line.trim();
                const lineObj = getObj(line);
                return getStr(lineObj['text']) || getStr(lineObj['draft_text'] ?? lineObj['draftText']);
              })
              .filter((t: string) => t.length > 0)
          : [];

        const draftText =
          getStr(obj['draft_text'] ?? obj['draftText']) ||
          getStr(obj['chapter_text'] ?? obj['chapterText']) ||
          getStr(obj['text']) ||
          getStr(obj['body']) ||
          (typeof contentValue === 'string' ? getStr(contentValue) : '') ||
          (contentArray.length ? contentArray.join('\n\n') : '') ||
          getStr(nestedDraft['draft_text'] ?? nestedDraft['draftText']) ||
          getStr(nestedDraft['text']) ||
          getStr(nestedDraft['body']);

        if (!title && !draftText) return null;
        return {
          title: title || 'Untitled Chapter',
          draftText,
        };
      })
      .filter(Boolean) as Array<{ title: string; draftText: string }>;

    return chapters;
  }, [content]);

  useEffect(() => {
    if (!isOpen) return;
    if (refineSection !== 'chapter') return;
    if (extractChapters.length === 0) {
      setRefineSection('draft');
      setRefineChapterTitle('');
      return;
    }
    if (!refineChapterTitle) {
      setRefineChapterTitle(extractChapters[0]?.title ?? '');
    }
  }, [extractChapters, isOpen, refineChapterTitle, refineSection]);

  useEffect(() => {
    if (!isOpen) return;
    setDraftTitle(title);
    setDraftText(extractWritingContext.draft ?? '');
    const meta = (initialMetadata ?? {}) as Record<string, unknown>;
    setDraftStatus(
      typeof meta['writing_status'] === 'string' ? String(meta['writing_status']) : '',
    );
    setDraftTagsText(
      Array.isArray(meta['writing_tags'])
        ? (meta['writing_tags'] as unknown[]).map((t: unknown) => String(t)).join(', ')
        : '',
    );
    setSaveError(null);
    setSaving(false);
    setCopiedPrompt(false);
    setRefineResult('');
    setJumpHeadingIndex('');
    setFindQuery('');
    setFindPos(null);
    setShowAudioPanel(true);
    setDictating(false);
    setDictationInterim('');
    setDictationError(null);
    setTtsSpeaking(false);
    setTtsPaused(false);
    setTtsError(null);

    const desired = initialMode ?? 'formatted';
    if (desired === 'edit' && !canEdit) {
      setViewMode('formatted');
    } else {
      setViewMode(desired);
    }
  }, [isOpen, title, rawText, initialMode, canEdit, initialMetadata, extractWritingContext.draft]);

  useEffect(() => {
    if (!isOpen) {
      stopDictation();
      stopTts();
      return;
    }

    setDictationSupported(Boolean(getSpeechRecognitionCtor()));
    const supported = typeof SpeechSynthesisUtterance !== 'undefined' && 'speechSynthesis' in window;
    setTtsSupported(supported);
    if (!supported) return;

    const updateVoices = () => {
      try {
        const v = window.speechSynthesis.getVoices();
        setVoices(v);
        if (v.length > 0) {
          const hasExisting = Boolean(voiceURI) && v.some((entry) => entry.voiceURI === voiceURI);
          if (!hasExisting) {
            setVoiceURI(pickDefaultVoiceURI(v));
          }
        }
      } catch {
        setVoices([]);
      }
    };

    updateVoices();
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
  }, [isOpen, voiceURI]);

  useEffect(() => {
    if (viewMode !== 'edit' && dictating) stopDictation();
  }, [dictating, viewMode]);

  useEffect(() => {
    if (!isOpen) return;
    if (viewMode !== 'edit') return;
    const el = editorRef.current;
    if (!el) return;
    const id = window.setTimeout(() => {
      try {
        el.focus();
      } catch {
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [isOpen, viewMode]);

  const handleEnterEdit = () => {
    setDraftTitle(title);
    setDraftText(extractWritingContext.draft ?? '');
    setSaveError(null);
    setViewMode('edit');
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const tags = draftTagsText
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const metadataUpdate: Record<string, unknown> = {
        ...(initialMetadata ?? {}),
        writing_status: draftStatus || undefined,
        writing_tags: tags.length ? tags : [],
      };

      await onSave({
        title: draftTitle.trim().length ? draftTitle.trim() : safeTitle,
        content: draftText,
        metadata: metadataUpdate,
      });
      setViewMode('formatted');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const applyRefineResultToEditor = () => {
    const result = refineResult.trim();
    if (!result) return;

    const applyIntoText = (base: string, heading: string, newBody: string): string => {
      const trimmed = base || '';
      const pattern = new RegExp(`(^|\\n)##\\s+${heading}\\s*\\n([\\s\\S]*?)(\\n##\\s+|$)`, 'i');
      if (pattern.test(trimmed)) {
        return trimmed.replace(pattern, (_match, prefix, _body, suffix) => {
          const leading = prefix || '\n';
          const tail = suffix || '';
          return `${leading}## ${heading}\n${newBody.trim()}\n${tail}`;
        });
      }

      const insertion = `## ${heading}\n${newBody.trim()}\n\n`;
      return insertion + trimmed;
    };

    const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const applyIntoChapter = (base: string, chapterTitle: string, newBody: string): string => {
      const trimmed = base || '';
      const safeTitle = chapterTitle.trim();
      if (!safeTitle) return applyIntoText(trimmed, 'Chapter', newBody);

      const pattern = new RegExp(
        `(^|\\n)(#{1,6})\\s+.*${escapeRegExp(safeTitle)}.*\\s*\\n([\\s\\S]*?)(\\n#{1,6}\\s+|$)`,
        'i',
      );

      if (pattern.test(trimmed)) {
        return trimmed.replace(pattern, (_match, prefix, hashes, _body, suffix) => {
          const leading = prefix || '\n';
          const tail = suffix || '';
          return `${leading}${hashes} ${safeTitle}\n${newBody.trim()}\n${tail}`;
        });
      }

      const insertion = `## ${safeTitle}\n${newBody.trim()}\n\n`;
      return insertion + trimmed;
    };

    setViewMode('edit');
    if (refineSection === 'summary') {
      setDraftText((prev) => applyIntoText(prev, 'Summary', result));
    } else if (refineSection === 'outline') {
      setDraftText((prev) => applyIntoText(prev, 'Outline', result));
    } else if (refineSection === 'chapter') {
      setDraftText((prev) => applyIntoChapter(prev, refineChapterTitle, result));
    } else {
      setDraftText(result);
    }
  };

  const refineSourceText = useMemo(() => {
    if (refineSection === 'summary') return extractWritingContext.summary;
    if (refineSection === 'outline') return extractWritingContext.outline;
    if (refineSection === 'chapter') {
      const ch = extractChapters.find((c) => c.title === refineChapterTitle);
      return ch?.draftText || '';
    }
    if (viewMode === 'edit') return draftText;
    return extractWritingContext.draft;
  }, [extractWritingContext, extractChapters, refineChapterTitle, refineSection, viewMode, draftText]);

  const refinePrompt = useMemo(() => {
    const parts: string[] = [];
    parts.push('You are an expert editor and writing coach.');
    parts.push('');
    parts.push(`Title: ${safeTitle}`);
    if (deliverable) parts.push(`Type: ${deliverable}`);
    if (extractWritingContext.genre) parts.push(`Genre: ${extractWritingContext.genre}`);
    if (extractWritingContext.tone) parts.push(`Tone: ${extractWritingContext.tone}`);
    if (extractWritingContext.audience) parts.push(`Audience: ${extractWritingContext.audience}`);
    parts.push('');

    parts.push(
      refineSection === 'chapter'
        ? `Task: Refine the chapter titled "${refineChapterTitle || 'Chapter'}".`
        : `Task: Refine the ${refineSection} section.`,
    );
    parts.push('Constraints:');
    parts.push('- Preserve factual consistency and continuity.');
    parts.push('- Keep the author voice consistent with the stated tone.');
    parts.push('- Return revised text only (no commentary), unless asked.');
    parts.push('');

    if (refineGoal.trim()) {
      parts.push('Additional instructions:');
      parts.push(refineGoal.trim());
      parts.push('');
    }

    parts.push('Current text:');
    parts.push('---');
    parts.push(refineSourceText || '(empty)');
    parts.push('---');
    parts.push('');
    parts.push('Deliver the revised version now.');
    return parts.join('\n');
  }, [deliverable, extractWritingContext, refineChapterTitle, refineGoal, refineSection, refineSourceText, safeTitle]);

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(refinePrompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 1200);
    } catch {
      setCopiedPrompt(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gray-900 text-white">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5" />
              <div className="min-w-0">
                <div className="text-lg font-semibold truncate">{safeTitle}</div>
                {deliverable && (
                  <div className="text-xs text-gray-300 truncate">{deliverable}</div>
                )}
                {wordCount > 0 && (
                  <div className="text-xs text-gray-300">
                    {wordCount.toLocaleString()} words{readingTimeMinutes > 0 ? ` • ~${readingTimeMinutes} min` : ''}
                  </div>
                )}
                {(draftStatus || tagList.length > 0) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {draftStatus && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] bg-purple-600 text-white">
                        {draftStatus}
                      </span>
                    )}
                    {tagList.slice(0, 6).map((t) => (
                      <span key={t} className="px-2 py-0.5 rounded-full text-[11px] bg-gray-700 text-gray-100">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('formatted')}
              className={`px-3 py-1.5 text-sm rounded flex items-center gap-2 ${
                viewMode === 'formatted'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              }`}
            >
              <FileText className="w-4 h-4" />
              Formatted
            </button>
            <button
              type="button"
              onClick={() => setViewMode('raw')}
              className={`px-3 py-1.5 text-sm rounded flex items-center gap-2 ${
                viewMode === 'raw'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              }`}
            >
              <Code className="w-4 h-4" />
              Raw
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={handleEnterEdit}
                className={`px-3 py-1.5 text-sm rounded flex items-center gap-2 ${
                  viewMode === 'edit'
                    ? 'bg-gray-700 text-gray-200'
                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                }`}
                aria-disabled={viewMode === 'edit'}
              >
                <Pencil className="w-4 h-4" />
                {viewMode === 'edit' ? 'Editing' : 'Edit'}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowRefinePanel((prev) => !prev)}
              className="px-3 py-1.5 text-sm rounded flex items-center gap-2 bg-gray-700 text-gray-200 hover:bg-gray-600"
            >
              <Wand2 className="w-4 h-4" />
              Refine
            </button>

            <button
              type="button"
              onClick={() => {
                setShowAudioPanel((prev) => {
                  const next = !prev;
                  if (!next) {
                    stopTts();
                    stopDictation();
                  }
                  return next;
                });
              }}
              title={showAudioPanel ? 'Hide audio controls' : 'Show audio controls'}
              aria-label={showAudioPanel ? 'Hide audio controls' : 'Show audio controls'}
              className={`p-2 rounded ${showAudioPanel ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}
            >
              <Volume2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors p-2"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            </div>
          </div>

          {showAudioPanel && (
            <div className="px-4 pb-4">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-2">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">
                    <button
                      type="button"
                      onClick={toggleTts}
                      disabled={!ttsSupported}
                      className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-100 hover:bg-gray-600 disabled:opacity-60 flex items-center gap-1.5"
                    >
                      {ttsSpeaking && !ttsPaused ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      {ttsSpeaking ? (ttsPaused ? 'Resume' : 'Pause') : 'Read'}
                    </button>
                    <button
                      type="button"
                      onClick={stopTts}
                      disabled={!ttsSupported}
                      className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-100 hover:bg-gray-600 disabled:opacity-60 flex items-center gap-1.5"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Stop
                    </button>

                    {viewMode === 'edit' && (
                      <button
                        type="button"
                        onClick={() => (dictating ? stopDictation() : startDictation())}
                        disabled={!dictationSupported}
                        className={`px-2 py-1 text-xs rounded flex items-center gap-1.5 disabled:opacity-60 ${
                          dictating ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-gray-700 text-gray-100 hover:bg-gray-600'
                        }`}
                      >
                        <Mic className="w-3.5 h-3.5" />
                        {dictating ? 'Stop' : 'Dictate'}
                      </button>
                    )}

                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="text-[10px] font-medium text-gray-200">Voice</div>
                      <select
                        value={voiceURI}
                        onChange={(e) => setVoiceURI(e.target.value)}
                        disabled={!ttsSupported || voices.length === 0}
                        className="w-60 px-2 py-1 border border-gray-600 rounded text-xs bg-gray-700 text-gray-100 disabled:opacity-60"
                      >
                        {voices.length === 0 ? (
                          <option value="">(no voices)</option>
                        ) : (
                          voices.map((v) => (
                            <option key={v.voiceURI} value={v.voiceURI}>
                              {v.name} ({v.lang})
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div className="text-[10px] font-medium text-gray-200">Rate</div>
                      <input
                        type="range"
                        min={0.6}
                        max={1.4}
                        step={0.1}
                        value={ttsRate}
                        onChange={(e) => setTtsRate(Number(e.target.value))}
                        disabled={!ttsSupported}
                        className="w-24"
                      />
                      <div className="text-[11px] text-gray-200 w-10 text-right">{Number(ttsRate).toFixed(1)}x</div>
                    </div>
                  </div>

                  {(ttsError || dictationError) && (
                    <div className="flex items-start gap-2 p-2 bg-red-900/30 border border-red-800/40 rounded-md text-xs text-red-100">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5" />
                      <div>{ttsError || dictationError}</div>
                    </div>
                  )}

                  {viewMode === 'edit' && dictating && dictationInterim && (
                    <div className="text-xs text-gray-200">Listening… “{dictationInterim}”</div>
                  )}

                  {viewMode === 'edit' && !dictationSupported && (
                    <div className="text-[11px] text-gray-300">Dictation is not supported in this browser.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 overflow-auto flex-1">
          {showRefinePanel && (
            <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-purple-900 flex items-center gap-2">
                  <Wand2 className="w-4 h-4" />
                  Refine with AI
                </div>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  {copiedPrompt ? 'Copied' : 'Copy Prompt'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Section</label>
                  <select
                    value={refineSection}
                    onChange={(e) => setRefineSection(e.target.value as 'draft' | 'summary' | 'outline' | 'chapter')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="draft">Draft</option>
                    <option value="summary">Summary</option>
                    <option value="outline">Outline</option>
                    {extractChapters.length > 0 && <option value="chapter">Chapter</option>}
                  </select>
                </div>
                {refineSection === 'chapter' && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Chapter</label>
                    <select
                      value={refineChapterTitle}
                      onChange={(e) => setRefineChapterTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      {extractChapters.map((ch) => (
                        <option key={ch.title} value={ch.title}>
                          {ch.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Goal / instructions</label>
                  <input
                    type="text"
                    value={refineGoal}
                    onChange={(e) => setRefineGoal(e.target.value)}
                    placeholder="e.g., tighten prose, increase tension, add clearer headings, remove repetition"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <details>
                <summary className="cursor-pointer text-sm text-purple-900">Preview prompt</summary>
                <pre className="mt-2 bg-white border border-purple-200 rounded-md p-3 text-xs whitespace-pre-wrap font-mono max-h-60 overflow-auto">
                  {refinePrompt}
                </pre>
              </details>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Paste AI revised text</label>
                  <textarea
                    value={refineResult}
                    onChange={(e) => setRefineResult(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                    rows={6}
                    placeholder="Paste the revised output here..."
                  />
                </div>
                <div className="flex flex-col justify-between">
                  <div className="text-xs text-gray-600">
                    Apply will switch to Edit mode and insert/replace the relevant section.
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setRefineResult('')}
                      className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={applyRefineResultToEditor}
                      className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
                    >
                      Apply to Editor
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {viewMode === 'edit' ? (
            <div className="space-y-4">
              {saveError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
                  <AlertCircle className="w-4 h-4 mt-0.5" />
                  <div>{saveError}</div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                {headings.length > 1 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Jump to section</label>
                    <select
                      value={jumpHeadingIndex}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const next = raw === '' ? '' : Number(raw);
                        setJumpHeadingIndex(next);
                        if (typeof next === 'number' && Number.isFinite(next)) {
                          jumpTo(next);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">(select)</option>
                      {headings.map((h) => (
                        <option key={`${h.index}-${h.title}`} value={h.index}>
                          {`${' '.repeat(Math.max(0, h.level - 1) * 2)}${h.title}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Find in draft</label>
                    <input
                      type="text"
                      value={findQuery}
                      onChange={(e) => {
                        setFindQuery(e.target.value);
                        setFindPos(null);
                      }}
                      placeholder="search"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={() => runFind('prev')}
                      disabled={!findQuery.trim().length}
                      className="px-3 py-2 bg-gray-200 text-gray-700 font-medium rounded-md hover:bg-gray-300 transition-colors disabled:opacity-60"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => runFind('next')}
                      disabled={!findQuery.trim().length}
                      className="px-3 py-2 bg-gray-200 text-gray-700 font-medium rounded-md hover:bg-gray-300 transition-colors disabled:opacity-60"
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                  <input
                    type="text"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <select
                      value={draftStatus}
                      onChange={(e) => setDraftStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">(none)</option>
                      <option value="draft">Draft</option>
                      <option value="revised">Revised</option>
                      <option value="final">Final</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={draftTagsText}
                        onChange={(e) => setDraftTagsText(e.target.value)}
                        placeholder="comma-separated"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
                  <textarea
                    ref={editorRef}
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
                    rows={18}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('formatted')}
                  disabled={saving}
                  className="px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-md hover:bg-gray-300 transition-colors disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-purple-600 text-white font-medium rounded-md hover:bg-purple-700 transition-colors disabled:opacity-60 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : viewMode === 'formatted' ? (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <ContentRenderer content={formattedContentForDisplay} deliverable={deliverable} />
            </div>
          ) : (
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono">
              {rawContentForDisplay}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
