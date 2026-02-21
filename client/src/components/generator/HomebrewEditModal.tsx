/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useEffect } from 'react';
import { X, Save, Search, Filter, ChevronDown, ChevronUp, Trash2, Plus, Edit3, Merge, Split, Database, CheckCircle, Sparkles, Copy, Check, AlertCircle } from 'lucide-react';
import ClaimsEditor from '../shared/ClaimsEditor';
import { parseAIResponse, formatParseError } from '../../utils/jsonParser';
import ConfirmationModal from '../common/ConfirmationModal';

type HomebrewEntry = {
  type: string;
  title: string;
  short_summary: string;
  long_description: string;
  tags: string[];
  assumptions: string[];
  notes: string[];
  section_title?: string;
  chunk_index?: number;
  // AI-extracted claims (if processed with AI)
  claims?: Array<{ text: string; source: string }>;
};

type JsonRecord = Record<string, unknown>;

interface HomebrewEditModalProps {
  isOpen: boolean;
  homebrewContent: JsonRecord;
  projectId?: string;
  onSave: (editedContent: JsonRecord) => void;
  onClose: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function HomebrewEditModal({
  isOpen,
  homebrewContent,
  projectId,
  onSave,
  onClose,
}: HomebrewEditModalProps) {
  const [entries, setEntries] = useState<HomebrewEntry[]>([]);
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set());
  const [editingEntry, setEditingEntry] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<HomebrewEntry>>({});
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectedEntryIndex, setSelectedEntryIndex] = useState<number | null>(null);
  const [tagInput, setTagInput] = useState<string>('');
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [entriesInLibrary, setEntriesInLibrary] = useState<Set<number>>(new Set());
  const [addingToLibrary, setAddingToLibrary] = useState<number | null>(null);

  // Dialog state - replaces alert(), confirm(), and prompt() calls
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [showAddTagDialog, setShowAddTagDialog] = useState(false);
  const [addTagInput, setAddTagInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<{ title: string; message: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // AI Workflow State
  const [showAIWorkflow, setShowAIWorkflow] = useState(false);
  const [aiWorkflowStep, setAIWorkflowStep] = useState<'info' | 'generate' | 'copy-prompt' | 'paste-response'>('info');
  const [aiPromptText, setAIPromptText] = useState('');
  const [aiResponseText, setAIResponseText] = useState('');
  const [copiedAIPrompt, setCopiedAIPrompt] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);
  const [parseAttempts, setParseAttempts] = useState<Record<number, number>>({});
  const [refiningEntryIndex, setRefiningEntryIndex] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen && homebrewContent) {
      const entriesData = Array.isArray(homebrewContent.entries) ? homebrewContent.entries as HomebrewEntry[] : [];
      const unparsedData = Array.isArray(homebrewContent.unparsed) ? homebrewContent.unparsed as string[] : [];

      setEntries(entriesData);
      setUnparsed(unparsedData);
      setExpandedEntries(new Set());
      setEditingEntry(null);
    }
  }, [isOpen, homebrewContent]);

  if (!isOpen) return null;

  // Get unique types for filtering
  const types = ['all', ...new Set(entries.map(e => e.type))];

  // Filter entries
  const filteredEntries = entries.filter(entry => {
    const matchesSearch = searchTerm === '' ||
      entry.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.short_summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesType = filterType === 'all' || entry.type === filterType;

    return matchesSearch && matchesType;
  });

  const typeCounts = entries.reduce((acc, entry) => {
    acc[entry.type] = (acc[entry.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const toggleExpand = (index: number) => {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedEntries(newExpanded);
  };

  const startEdit = (index: number) => {
    setEditingEntry(index);
    setEditForm({ ...entries[index] });
    setTagInput('');
    setTagSuggestions([]);
  };

  const cancelEdit = () => {
    setEditingEntry(null);
    setEditForm({});
    setTagInput('');
    setTagSuggestions([]);
  };

  const saveEdit = () => {
    if (editingEntry !== null) {
      const newEntries = [...entries];
      newEntries[editingEntry] = editForm as HomebrewEntry;
      setEntries(newEntries);
      setEditingEntry(null);
      setEditForm({});
    }
  };

  /**
   * Show delete confirmation dialog for an entry
   * Replaces browser confirm() with modal
   */
  const deleteEntry = (index: number) => {
    setDeleteConfirm(index);
  };

  /**
   * Handle confirmed deletion of entry
   */
  const handleConfirmDelete = () => {
    if (deleteConfirm !== null) {
      setEntries(entries.filter((_, i) => i !== deleteConfirm));
      setDeleteConfirm(null);
    }
  };

  const addNewEntry = () => {
    const newEntry: HomebrewEntry = {
      type: 'rule',
      title: 'New Entry',
      short_summary: '',
      long_description: '',
      tags: [],
      assumptions: [],
      notes: [],
    };
    setEntries([...entries, newEntry]);
    const newIndex = entries.length;
    setEditingEntry(newIndex);
    setEditForm(newEntry);
    setExpandedEntries(new Set([...expandedEntries, newIndex]));
  };

  const mergeWithAbove = (index: number) => {
    if (index === 0) return; // Can't merge first entry

    const previousEntry = entries[index - 1];
    const currentEntry = entries[index];

    // Get source information for proper attribution
    const fileName = (homebrewContent.fileName as string) || 'Homebrew Document';
    const sectionTitle = currentEntry.section_title || currentEntry.title;
    const sourceAttribution = `${fileName}:section_${sectionTitle.replace(/\s+/g, '_')}`;

    // Create a new claim from the current entry's content
    const newClaim = {
      text: `${currentEntry.title}: ${currentEntry.long_description}`,
      source: sourceAttribution,
    };

    // Merge claims: keep previous claims and add new one
    let mergedClaims: Array<{ text: string; source: string }>;
    if (previousEntry.claims && previousEntry.claims.length > 0) {
      // Previous entry has AI-extracted claims, add to them
      mergedClaims = [...previousEntry.claims, newClaim];
    } else if (currentEntry.claims && currentEntry.claims.length > 0) {
      // Current entry has AI claims, create default claims for previous and add all
      const prevSourceAttribution = `${fileName}:section_${(previousEntry.section_title || previousEntry.title).replace(/\s+/g, '_')}`;
      const previousClaims = [
        {
          text: previousEntry.short_summary || previousEntry.long_description.substring(0, 200),
          source: prevSourceAttribution,
        },
        {
          text: previousEntry.long_description,
          source: prevSourceAttribution,
        },
      ];
      mergedClaims = [...previousClaims, ...currentEntry.claims];
    } else {
      // Neither has claims, create default structure with new claim
      const prevSourceAttribution = `${fileName}:section_${(previousEntry.section_title || previousEntry.title).replace(/\s+/g, '_')}`;
      mergedClaims = [
        {
          text: previousEntry.short_summary || previousEntry.long_description.substring(0, 200),
          source: prevSourceAttribution,
        },
        {
          text: previousEntry.long_description,
          source: prevSourceAttribution,
        },
        newClaim,
      ];
    }

    // Combine all other data
    const mergedEntry: HomebrewEntry = {
      type: previousEntry.type, // Keep the previous entry's type
      title: previousEntry.title, // Keep the previous entry's title
      short_summary: previousEntry.short_summary, // Keep the previous entry's summary
      long_description: `${previousEntry.long_description}\n\n${currentEntry.title}:\n${currentEntry.long_description}`, // Combine with headers
      tags: [...new Set([...previousEntry.tags, ...currentEntry.tags])], // Combine unique tags
      assumptions: [...(previousEntry.assumptions || []), ...(currentEntry.assumptions || [])],
      notes: [...(previousEntry.notes || []), ...(currentEntry.notes || []), `Merged with: ${currentEntry.title}`],
      section_title: previousEntry.section_title,
      chunk_index: previousEntry.chunk_index,
      claims: mergedClaims, // Store all claims including the new one
    };

    // Remove current entry and update previous entry
    const newEntries = [...entries];
    newEntries[index - 1] = mergedEntry;
    newEntries.splice(index, 1);
    setEntries(newEntries);

    // Expand the merged entry (now at index - 1)
    const newExpanded = new Set(expandedEntries);
    newExpanded.delete(index); // Remove current entry's expanded state
    newExpanded.add(index - 1); // Expand the merged entry
    setExpandedEntries(newExpanded);
  };

  /**
   * Split an entry by extracting selected text into a new entry
   * Shows error messages instead of using alert()
   */
  const splitEntry = async (index: number) => {
    const entry = entries[index];

    // Validate selection - show inline error instead of alert()
    if (!selectedText || selectedText.trim() === '') {
      setErrorMessage({
        title: 'Selection Required',
        message: 'Please select text to split out first. Highlight the text you want to extract into a new entry.',
      });
      return;
    }

    // Validate remaining text - show inline error instead of alert()
    const remaining = entry.long_description.replace(selectedText, '').trim();
    if (!remaining) {
      setErrorMessage({
        title: 'Cannot Split Entry',
        message: 'No text would remain in the original entry after splitting. Please select only part of the description.',
      });
      return;
    }

    try {
      // Parse both pieces
      const [currentResponse, newResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/homebrew/parse-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: remaining, contextType: entry.type }),
        }),
        fetch(`${API_BASE_URL}/homebrew/parse-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: selectedText, contextType: entry.type }),
        }),
      ]);

      if (!currentResponse.ok || !newResponse.ok) throw new Error('Failed to parse split text');

      const [currentParsed, newParsed] = await Promise.all([
        currentResponse.json(),
        newResponse.json(),
      ]);

      // Update current entry
      const updatedCurrent: HomebrewEntry = {
        ...entry,
        title: currentParsed.title || entry.title,
        short_summary: currentParsed.short_summary || '',
        long_description: remaining,
        tags: currentParsed.tags || entry.tags,
      };

      // Create new entry
      const newEntry: HomebrewEntry = {
        type: newParsed.type || entry.type,
        title: newParsed.title || 'Split Entry',
        short_summary: newParsed.short_summary || '',
        long_description: selectedText,
        tags: newParsed.tags || [],
        assumptions: newParsed.assumptions || [],
        notes: newParsed.notes || [],
      };

      // Insert new entry after current
      const newEntries = [...entries];
      newEntries[index] = updatedCurrent;
      newEntries.splice(index + 1, 0, newEntry);
      setEntries(newEntries);

      // Clear selection
      setSelectedText('');
      setSelectedEntryIndex(null);

      // Expand both entries
      const newExpanded = new Set(expandedEntries);
      newExpanded.add(index);
      newExpanded.add(index + 1);
      setExpandedEntries(newExpanded);
    } catch (error) {
      console.error('Split error:', error);
      // Show error message instead of alert()
      setErrorMessage({
        title: 'Split Failed',
        message: `Failed to split entry. ${error instanceof Error ? error.message : 'Please try again.'}`,
      });
    }
  };

  const handleTextSelection = (index: number) => {
    const selection = window.getSelection();
    const text = selection?.toString() || '';

    if (text.trim()) {
      setSelectedText(text.trim());
      setSelectedEntryIndex(index);
    } else {
      setSelectedText('');
      setSelectedEntryIndex(null);
    }
  };

  // Get all unique tags across all entries
  const getAllTags = (): string[] => {
    const allTags = new Set<string>();
    entries.forEach(entry => {
      (entry.tags || []).forEach(tag => allTags.add(tag));
    });
    return Array.from(allTags).sort();
  };

  // Update tag suggestions based on input
  const updateTagSuggestions = (input: string) => {
    if (!input.trim()) {
      setTagSuggestions([]);
      return;
    }

    const allTags = getAllTags();
    const currentTags = editForm.tags || [];
    const filtered = allTags
      .filter(tag =>
        tag.toLowerCase().includes(input.toLowerCase()) &&
        !currentTags.includes(tag)
      )
      .slice(0, 10);

    setTagSuggestions(filtered);
  };

  // Add tag to current entry being edited
  const addTag = (tag: string) => {
    if (!tag.trim()) return;

    const normalizedTag = tag.trim().toLowerCase();
    const currentTags = editForm.tags || [];

    if (!currentTags.includes(normalizedTag)) {
      setEditForm({
        ...editForm,
        tags: [...currentTags, normalizedTag],
      });
    }

    setTagInput('');
    setTagSuggestions([]);
  };

  // Remove tag from current entry being edited
  const removeTag = (tagToRemove: string) => {
    setEditForm({
      ...editForm,
      tags: (editForm.tags || []).filter(tag => tag !== tagToRemove),
    });
  };

  /**
   * Show dialog to add a tag to all entries
   * Replaces browser prompt() with modal dialog
   */
  const addTagToAll = () => {
    setShowAddTagDialog(true);
    setAddTagInput('');
  };

  /**
   * Handle confirmed tag addition to all entries
   */
  const handleConfirmAddTag = () => {
    if (!addTagInput.trim()) {
      setShowAddTagDialog(false);
      return;
    }

    const normalizedTag = addTagInput.trim().toLowerCase();
    const updatedEntries = entries.map(entry => ({
      ...entry,
      tags: entry.tags.includes(normalizedTag)
        ? entry.tags
        : [...entry.tags, normalizedTag],
    }));

    setEntries(updatedEntries);
    setShowAddTagDialog(false);
    setAddTagInput('');
  };

  /**
   * Add a single entry to the canon library
   * Shows error messages inline instead of using alert()
   */
  const addEntryToLibrary = async (index: number) => {
    if (!projectId) {
      setErrorMessage({
        title: 'Project Required',
        message: 'Project ID is required to add entries to library. Please save your work to a project first.',
      });
      return;
    }

    const entry = entries[index];
    setAddingToLibrary(index);

    try {
      // Get source information from homebrewContent
      const fileName = (homebrewContent.fileName as string) || 'Homebrew Document';
      const sectionTitle = entry.section_title || entry.title;

      // Format source like the earlier system: "filename.pdf:section_SectionName"
      const sourceAttribution = `${fileName}:section_${sectionTitle.replace(/\s+/g, '_')}`;

      // Map homebrew entry type to canon entity type
      const mapType = (homebrewType: string): string => {
        const type = homebrewType.toLowerCase();
        if (type === 'race' || type === 'subrace' || type === 'class' ||
            type === 'subclass' || type === 'feat' || type === 'background') {
          return 'rule';
        }
        if (type === 'spell') return 'spell';
        if (type === 'item') return 'item';
        if (type === 'creature') return 'monster';
        if (type === 'lore') return 'rule';
        return 'rule';
      };

      // Use AI-extracted claims if available, otherwise create default 2 claims
      const claims = entry.claims && entry.claims.length > 0
        ? entry.claims
        : [
            {
              text: entry.short_summary || entry.long_description.substring(0, 200),
              source: sourceAttribution,
            },
            {
              text: entry.long_description,
              source: sourceAttribution,
            },
          ];

      // Format as canon entity with proper source attribution
      const formattedEntity = {
        type: mapType(entry.type),
        canonical_name: entry.title,
        aliases: [],
        claims,
        homebrew_metadata: {
          homebrew_type: entry.type,
          tags: entry.tags || [],
          short_summary: entry.short_summary,
          assumptions: entry.assumptions || [],
          notes: entry.notes || [],
        },
      };

      // Call the upload/approve endpoint
      const response = await fetch(`${API_BASE_URL}/upload/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entities: [formattedEntity],
          sourceName: 'Homebrew Import',
          projectId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add entry to library');
      }

      const result = await response.json();

      // Mark entry as in library
      const newEntriesInLibrary = new Set(entriesInLibrary);
      newEntriesInLibrary.add(index);
      setEntriesInLibrary(newEntriesInLibrary);

      // Show success message - replaces alert() with state-based message
      const message = result.entitiesCreated > 0
        ? `Added "${entry.title}" to canon library (new entity)`
        : result.entitiesUpdated > 0
        ? `Updated "${entry.title}" in canon library (entity existed with changes)`
        : `"${entry.title}" already exists in library with same content`;

      setSuccessMessage(message);

      // Auto-dismiss success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error) {
      console.error('Error adding entry to library:', error);
      // Show error message - replaces alert() with modal
      setErrorMessage({
        title: 'Failed to Add to Library',
        message: `Failed to add "${entry.title}" to library: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setAddingToLibrary(null);
    }
  };

  // AI Extraction System Prompt (comprehensive extraction)
  const AI_EXTRACTION_PROMPT = `You are a D&D homebrew content extraction expert.
Your job is to analyze homebrew D&D 5e content and extract MULTIPLE discrete facts/claims per entity.

CRITICAL: Break down information into ATOMIC FACTS (1-2 sentences each)
- BAD: One giant claim with all information
- GOOD: Multiple small claims, each describing ONE specific aspect

For homebrew entries, extract:
1. TYPE & NAME: Canonical name and type
2. MULTIPLE CLAIMS: Break description into discrete, searchable facts
   - Each mechanical rule = separate claim
   - Each lore element = separate claim
   - Each requirement/prerequisite = separate claim

EXAMPLE - GOOD EXTRACTION:
Input: "Vampiric Regeneration: At 3rd level, you gain regeneration equal to your Constitution modifier. This doesn't work in sunlight."

Output:
{
  "canonical_name": "Vampiric Regeneration",
  "type": "rule",
  "claims": [
    { "text": "Vampiric Regeneration is available at 3rd level.", "source": "FILE:section_NAME" },
    { "text": "You gain regeneration equal to your Constitution modifier.", "source": "FILE:section_NAME" },
    { "text": "Vampiric Regeneration does not function in sunlight.", "source": "FILE:section_NAME" }
  ]
}

HOMEBREW TYPES TO MAP:
- race/subrace/class/subclass/feat/background → "rule"
- spell → "spell"
- item → "item"
- creature → "monster"
- lore → "rule"
- rule → "rule"

OUTPUT STRUCTURE:
{
  "entities": [
    {
      "type": "npc | monster | item | spell | location | faction | rule | timeline",
      "canonical_name": "Entry Name",
      "aliases": ["Alternative Name"],
      "claims": [
        { "text": "Discrete fact 1", "source": "SOURCE:section_SECTION" },
        { "text": "Discrete fact 2", "source": "SOURCE:section_SECTION" },
        { "text": "Discrete fact 3", "source": "SOURCE:section_SECTION" }
      ],
      "homebrew_metadata": {
        "homebrew_type": "original type from source",
        "tags": ["tag1", "tag2"],
        "short_summary": "Brief one-sentence summary",
        "full_description": "Complete original description for reference"
      }
    }
  ]
}

IMPORTANT:
- Create 3-10 discrete claims per entry (not just 1-2)
- Each claim should be independently searchable
- Use proper source attribution: "FILENAME:section_SECTIONNAME"
- Include homebrew_metadata with original content

JSON FORMATTING CRITICAL:
- If text contains words with "quotes" around them, you MUST use single quotes 'like this' instead in the JSON output
- Or escape them properly with backslash: \\"quoted word\\"
- Example BAD: "text": "The word "hello" causes errors"
- Example GOOD: "text": "The word 'hello' works fine"
- This is essential for valid JSON output`;

  // Generate AI prompt for all entries or specific entry
  const generateAIPrompt = (entryIndex: number | null = null) => {
    const fileName = (homebrewContent.fileName as string) || 'Homebrew Document';
    const sectionTitle = (homebrewContent.section_title as string) || 'Unknown Section';

    let contentToRefine = '';

    if (entryIndex !== null) {
      // Refining a single entry
      const entry = entries[entryIndex];
      const attempts = parseAttempts[entryIndex] || 0;

      if (attempts >= 3) {
        setAIError('Maximum refinement attempts (3) reached for this entry. Please edit manually.');
        return;
      }

      contentToRefine = `ENTRY TO REFINE:
Type: ${entry.type}
Title: ${entry.title}
Summary: ${entry.short_summary}
Full Description:
${entry.long_description}

Current Tags: ${entry.tags.join(', ')}`;

      setRefiningEntryIndex(entryIndex);
    } else {
      // Processing all entries
      contentToRefine = entries.map((entry, idx) =>
        `--- Entry ${idx + 1} ---
Type: ${entry.type}
Title: ${entry.title}
Summary: ${entry.short_summary}
Description: ${entry.long_description}
Tags: ${entry.tags.join(', ')}`
      ).join('\n\n');
    }

    const fullPrompt = `${AI_EXTRACTION_PROMPT}

---

DOCUMENT: ${fileName}
SECTION: ${sectionTitle}

CONTENT TO PROCESS:
${contentToRefine}

---

Extract all entities with MULTIPLE discrete claims per entity. Output ONLY valid JSON.`;

    setAIPromptText(fullPrompt);
    setAIWorkflowStep('copy-prompt');
    setAIError(null);
  };

  // Handle copying AI prompt
  const handleCopyAIPrompt = async () => {
    await navigator.clipboard.writeText(aiPromptText);
    setCopiedAIPrompt(true);
    setTimeout(() => {
      setCopiedAIPrompt(false);
      setAIWorkflowStep('paste-response');
    }, 600);
  };

  // Attempt to repair common JSON issues
  // Process AI response and update entries
  const handleAIResponse = () => {
    setAIError(null);

    try {
      // Use improved JSON parser with better error messages
      const parseResult = parseAIResponse(aiResponseText.trim());

      if (!parseResult.success) {
        const errorMessage = formatParseError(parseResult);
        throw new Error(errorMessage);
      }

      const parsed = parseResult.data as any;

      if (!parsed.entities || !Array.isArray(parsed.entities)) {
        throw new Error('Response must contain an "entities" array');
      }

      if (refiningEntryIndex !== null) {
        // Update single entry
        const aiEntity = parsed.entities[0];
        if (!aiEntity) {
          throw new Error('No entity found in AI response');
        }

        const updatedEntry: HomebrewEntry = {
          type: aiEntity.homebrew_metadata?.homebrew_type || aiEntity.type,
          title: aiEntity.canonical_name,
          short_summary: aiEntity.homebrew_metadata?.short_summary || (aiEntity.claims[0]?.text || ''),
          long_description: aiEntity.homebrew_metadata?.full_description || aiEntity.claims.map((c: any) => c.text).join(' '),
          tags: aiEntity.homebrew_metadata?.tags || [],
          assumptions: aiEntity.homebrew_metadata?.assumptions || [],
          notes: [`AI-refined: ${aiEntity.claims.length} discrete claims extracted`],
          section_title: entries[refiningEntryIndex].section_title,
          chunk_index: entries[refiningEntryIndex].chunk_index,
          claims: aiEntity.claims || [], // Store AI-extracted claims
        };

        const newEntries = [...entries];
        newEntries[refiningEntryIndex] = updatedEntry;
        setEntries(newEntries);

        // Track refinement attempt
        setParseAttempts(prev => ({
          ...prev,
          [refiningEntryIndex]: (prev[refiningEntryIndex] || 0) + 1,
        }));

        // Show success message - replaces alert()
        setSuccessMessage(`Entry "${updatedEntry.title}" refined with ${aiEntity.claims.length} discrete claims`);
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        // Replace all entries with AI-processed versions
        const newEntries: HomebrewEntry[] = parsed.entities.map((entity: any, idx: number) => ({
          type: entity.homebrew_metadata?.homebrew_type || entity.type,
          title: entity.canonical_name,
          short_summary: entity.homebrew_metadata?.short_summary || (entity.claims[0]?.text || ''),
          long_description: entity.homebrew_metadata?.full_description || entity.claims.map((c: any) => c.text).join(' '),
          tags: entity.homebrew_metadata?.tags || [],
          assumptions: entity.homebrew_metadata?.assumptions || [],
          notes: [`AI-extracted: ${entity.claims.length} discrete claims`],
          section_title: entries[idx]?.section_title,
          chunk_index: entries[idx]?.chunk_index,
          claims: entity.claims || [], // Store AI-extracted claims
        }));

        setEntries(newEntries);
        alert(`✅ Processed ${newEntries.length} entries with AI extraction`);
      }

      // Close workflow
      setShowAIWorkflow(false);
      setAIWorkflowStep('info');
      setRefiningEntryIndex(null);
      setAIResponseText('');
    } catch (err: any) {
      console.error('AI response parse error:', err);
      setAIError(`Failed to process AI response: ${err.message}`);
    }
  };

  const handleSave = () => {
    const updatedContent = {
      ...homebrewContent,
      entries,
      unparsed,
    };
    onSave(updatedContent);
  };

  const typeColors: Record<string, string> = {
    race: 'bg-purple-100 text-purple-800',
    subrace: 'bg-purple-100 text-purple-800',
    rule: 'bg-red-100 text-red-800',
    lore: 'bg-indigo-100 text-indigo-800',
    spell: 'bg-blue-100 text-blue-800',
    item: 'bg-green-100 text-green-800',
    creature: 'bg-orange-100 text-orange-800',
    class: 'bg-cyan-100 text-cyan-800',
    subclass: 'bg-cyan-100 text-cyan-800',
    feat: 'bg-yellow-100 text-yellow-800',
    background: 'bg-teal-100 text-teal-800',
  };

  return (
    <>
      {/* Delete Entry Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteConfirm !== null}
        title="Delete Entry"
        message={deleteConfirm !== null ? `Are you sure you want to delete "${entries[deleteConfirm]?.title}"? This action cannot be undone.` : ''}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Add Tag to All Dialog */}
      {showAddTagDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="bg-blue-600 text-white p-4">
              <h2 className="text-lg font-bold">Add Tag to All Entries</h2>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter tag name
              </label>
              <input
                type="text"
                value={addTagInput}
                onChange={(e) => setAddTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmAddTag()}
                placeholder="e.g., custom-spell"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
              <p className="mt-2 text-xs text-gray-500">
                This tag will be added to all {entries.length} entries in lowercase.
              </p>
            </div>
            <div className="border-t border-gray-200 p-4 bg-gray-50 flex gap-3 justify-end">
              <button
                onClick={() => setShowAddTagDialog(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAddTag}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700"
              >
                Add Tag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Message Modal */}
      {errorMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="bg-red-600 text-white p-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{errorMessage.title}</h2>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-white hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-700">{errorMessage.message}</p>
              </div>
            </div>
            <div className="border-t border-gray-200 p-4 bg-gray-50 flex justify-end">
              <button
                onClick={() => setErrorMessage(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-md hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Message Banner */}
      {successMessage && (
        <div className="fixed top-4 right-4 z-50 max-w-md">
          <div className="bg-green-600 text-white p-4 rounded-lg shadow-lg flex items-start gap-3">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">{successMessage}</p>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-white hover:text-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-7xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
          <div className="flex items-center justify-between p-6">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900">Edit Homebrew Content</h2>
              <p className="text-sm text-gray-600 mt-1">
                {filteredEntries.length} of {entries.length} entries • {unparsed.length} unparsed sections
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Library Mapping Info */}
          <div className="px-6 pb-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-900 mb-1">📚 How Your Data Maps to the Canon Library:</p>
              <div className="text-xs text-blue-800 space-y-1">
                <div className="flex items-start gap-2">
                  <span className="font-medium min-w-20">Title →</span>
                  <span>Becomes the entity's <strong>canonical_name</strong> (searchable in library)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-medium min-w-20">Summary →</span>
                  <span>First <strong>fact/claim</strong> (quick reference info)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-medium min-w-20">Description →</span>
                  <span>Second <strong>fact/claim</strong> (detailed game mechanics)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-medium min-w-20">Tags →</span>
                  <span>Stored in <strong>homebrew_metadata</strong> (searchable/filterable)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex gap-3 items-center flex-wrap">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search entries..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                {types.map(type => (
                  <option key={type} value={type}>
                    {type === 'all' ? 'All Types' : `${type} (${typeCounts[type] || 0})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Add Entry Button */}
            <button
              onClick={addNewEntry}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium flex items-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Entry
            </button>

            {/* Add Tag to All Button */}
            <button
              onClick={addTagToAll}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium flex items-center gap-2 text-sm"
              title="Add a tag to all entries"
            >
              <Plus className="w-4 h-4" />
              Tag All
            </button>

            {/* Refine with AI Button */}
            <button
              onClick={() => {
                setShowAIWorkflow(true);
                setAIWorkflowStep('info');
                setRefiningEntryIndex(null);
              }}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium flex items-center gap-2 text-sm"
              title="Use AI to extract more detailed facts/claims"
            >
              <Sparkles className="w-4 h-4" />
              Refine with AI
            </button>
          </div>
        </div>

        {/* Entries List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            {filteredEntries.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No entries found matching your criteria
              </div>
            )}

            {filteredEntries.map((entry, _displayIndex) => {
              const actualIndex = entries.indexOf(entry);
              const isExpanded = expandedEntries.has(actualIndex);
              const isEditing = editingEntry === actualIndex;

              return (
                <div key={actualIndex} className="border border-gray-200 rounded-lg bg-white shadow-sm">
                  {/* Entry Header */}
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50" onClick={() => !isEditing && toggleExpand(actualIndex)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded capitalize ${typeColors[entry.type] || 'bg-gray-100 text-gray-800'}`}>
                          {entry.type}
                        </span>
                        <h3 className="font-semibold text-gray-900 truncate">{entry.title}</h3>
                      </div>
                      {entry.short_summary && !isExpanded && (
                        <p className="text-sm text-gray-600 line-clamp-1">{entry.short_summary}</p>
                      )}
                      {entry.tags.length > 0 && !isExpanded && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {entry.tags.slice(0, 5).map((tag, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                              {tag}
                            </span>
                          ))}
                          {entry.tags.length > 5 && (
                            <span className="px-1.5 py-0.5 text-xs text-gray-500">+{entry.tags.length - 5} more</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {/* Add to Library Button */}
                      {projectId && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            addEntryToLibrary(actualIndex);
                          }}
                          disabled={addingToLibrary === actualIndex}
                          className={`p-2 rounded transition-colors ${
                            entriesInLibrary.has(actualIndex)
                              ? 'text-green-600 hover:bg-green-50'
                              : 'text-indigo-600 hover:bg-indigo-50'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                          title={entriesInLibrary.has(actualIndex) ? 'Already in library - click to update' : 'Add to canon library'}
                        >
                          {addingToLibrary === actualIndex ? (
                            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                          ) : entriesInLibrary.has(actualIndex) ? (
                            <CheckCircle className="w-4 h-4" />
                          ) : (
                            <Database className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAIWorkflow(true);
                          generateAIPrompt(actualIndex);
                        }}
                        disabled={(parseAttempts[actualIndex] || 0) >= 3}
                        className="p-2 text-purple-600 hover:bg-purple-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={(parseAttempts[actualIndex] || 0) >= 3 ? 'Max AI refinements reached (3)' : 'Refine this entry with AI for better fact extraction'}
                      >
                        <Sparkles className="w-4 h-4" />
                      </button>
                      {actualIndex > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Merge "${entry.title}" into the entry above?\n\nThis entry's content will become an additional claim in the entry above.`)) {
                              mergeWithAbove(actualIndex);
                            }
                          }}
                          className="p-2 text-purple-600 hover:bg-purple-50 rounded transition-colors"
                          title="Merge into entry above (becomes a new claim)"
                        >
                          <Merge className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(actualIndex);
                          if (!isExpanded) toggleExpand(actualIndex);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteEntry(actualIndex);
                        }}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {!isEditing && (
                        isExpanded ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                  </div>

                  {/* Entry Details */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-3">
                      {isEditing ? (
                        <>
                          {/* Edit Form */}
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                <select
                                  value={editForm.type || ''}
                                  onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                >
                                  {types.filter(t => t !== 'all').map(type => (
                                    <option key={type} value={type}>{type}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Title
                                  <span className="text-xs text-gray-500 ml-1">(becomes canonical_name in library)</span>
                                </label>
                                <input
                                  type="text"
                                  value={editForm.title || ''}
                                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Summary
                                <span className="text-xs text-blue-600 ml-1">→ Fact/Claim #1 in library</span>
                              </label>
                              <textarea
                                value={editForm.short_summary || ''}
                                onChange={(e) => setEditForm({ ...editForm, short_summary: e.target.value })}
                                rows={2}
                                placeholder="Short summary that will appear as the first claim/fact in the canon library..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                This becomes the first searchable fact in the library (Source: Homebrew Import)
                              </p>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Full Description
                                <span className="text-xs text-blue-600 ml-1">→ Fact/Claim #2 in library</span>
                              </label>
                              <textarea
                                value={editForm.long_description || ''}
                                onChange={(e) => setEditForm({ ...editForm, long_description: e.target.value })}
                                rows={6}
                                placeholder="Complete description with all game mechanics and details..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                This becomes the detailed fact in the library with full mechanics
                              </p>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Tags
                                <span className="text-xs text-gray-500 ml-1">→ Stored as searchable metadata</span>
                              </label>

                              {/* Display existing tags as badges */}
                              {(editForm.tags || []).length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {(editForm.tags || []).map((tag, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded"
                                    >
                                      {tag}
                                      <button
                                        onClick={() => removeTag(tag)}
                                        className="hover:text-blue-900"
                                        type="button"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Tag input with autocomplete */}
                              <div className="relative">
                                <input
                                  type="text"
                                  value={tagInput}
                                  onChange={(e) => {
                                    setTagInput(e.target.value);
                                    updateTagSuggestions(e.target.value);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      addTag(tagInput);
                                    }
                                  }}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                  placeholder="Type to add tags (press Enter)"
                                />

                                {/* Autocomplete suggestions */}
                                {tagSuggestions.length > 0 && (
                                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-40 overflow-auto">
                                    {tagSuggestions.map((suggestion, idx) => (
                                      <button
                                        key={idx}
                                        type="button"
                                        onClick={() => addTag(suggestion)}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                                      >
                                        {suggestion}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* AI Claims Editor */}
                            {editForm.claims && editForm.claims.length > 0 && (
                              <ClaimsEditor
                                claims={editForm.claims}
                                onChange={(claims) => setEditForm({ ...editForm, claims })}
                                sourceContext={{
                                  fileName: (homebrewContent.fileName as string) || 'Homebrew Document',
                                  sectionTitle: editForm.section_title || editForm.title || 'Unknown'
                                }}
                                mode="edit"
                                label="AI-Extracted Claims"
                              />
                            )}
                          </div>
                          <div className="flex gap-2 justify-end pt-2">
                            <button
                              onClick={cancelEdit}
                              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 text-sm"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={saveEdit}
                              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                            >
                              Save Changes
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* View Mode */}
                          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                            <p className="text-xs text-blue-800 font-medium mb-1">📚 Library Preview</p>
                            <p className="text-xs text-blue-700">
                              This entry will be saved as <strong>{entry.title}</strong> with {
                                entry.claims && entry.claims.length > 0
                                  ? `${entry.claims.length} discrete claim${entry.claims.length !== 1 ? 's' : ''} (AI-extracted)`
                                  : entry.short_summary
                                    ? '2 facts/claims'
                                    : '1 fact/claim'
                              }
                              {entry.tags.length > 0 && ` and ${entry.tags.length !== 1 ? 's' : ''}`}
                            </p>
                          </div>

                          {/* AI-Extracted Claims Display */}
                          <ClaimsEditor
                            claims={entry.claims || []}
                            onChange={() => {}} // read-only in view mode
                            sourceContext={{
                              fileName: (homebrewContent.fileName as string) || 'Homebrew Document',
                              sectionTitle: entry.section_title || entry.title || 'Unknown'
                            }}
                            mode="view"
                            label="AI-Extracted Claims"
                          />

                          {entry.short_summary && !entry.claims && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-1">
                                Summary
                                <span className="text-xs text-blue-600 ml-1 font-normal">→ Fact #1</span>
                              </h4>
                              <p className="text-sm text-gray-900 bg-white border border-gray-200 rounded p-2">{entry.short_summary}</p>
                              <p className="text-xs text-gray-500 mt-1 italic">Source: Homebrew Import</p>
                            </div>
                          )}
                          {!entry.claims && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <h4 className="text-sm font-semibold text-gray-700">
                                  Full Description
                                  <span className="text-xs text-blue-600 ml-1 font-normal">→ Fact #{entry.short_summary ? '2' : '1'}</span>
                                </h4>
                              {selectedText && selectedEntryIndex === actualIndex && (
                                <button
                                  onClick={() => {
                                    if (confirm(`Split entry "${entry.title}"?\n\nSelected text will become a new entry.`)) {
                                      splitEntry(actualIndex);
                                    }
                                  }}
                                  className="px-3 py-1 bg-orange-600 text-white rounded-md hover:bg-orange-700 text-xs font-medium flex items-center gap-1"
                                  title="Split this entry at selected text"
                                >
                                  <Split className="w-3 h-3" />
                                  Split Selected Text
                                </button>
                              )}
                            </div>
                            <div
                              className="text-sm text-gray-900 whitespace-pre-wrap bg-white border border-gray-200 rounded p-3 max-h-48 overflow-auto font-mono select-text"
                              onMouseUp={() => handleTextSelection(actualIndex)}
                            >
                              {entry.long_description}
                            </div>
                            <p className="text-xs text-gray-500 mt-1 italic">Source: Homebrew Import</p>
                            </div>
                          )}
                          {entry.tags.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-1">
                                Tags
                                <span className="text-xs text-gray-500 ml-1 font-normal">→ Stored in homebrew_metadata</span>
                              </h4>
                              <div className="flex flex-wrap gap-1">
                                {entry.tags.map((tag, idx) => (
                                  <span key={idx} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                              <p className="text-xs text-gray-500 mt-1 italic">Searchable metadata in the library</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Unparsed Content Section */}
          {unparsed.length > 0 && (
            <div className="mt-6 border-t-2 border-yellow-300 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Unparsed Content</h3>
              <div className="space-y-3">
                {unparsed.map((section, idx) => (
                  <div key={idx} className="bg-yellow-50 border border-yellow-200 rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-yellow-700 font-medium">Section {idx + 1}</span>
                      <button
                        onClick={() => setUnparsed(unparsed.filter((_, i) => i !== idx))}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono max-h-32 overflow-auto">
                      {section}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {entries.length} total entries • {Object.keys(typeCounts).length} types
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium flex items-center gap-2 transition-colors shadow-sm"
            >
              <Save className="w-4 h-4" />
              Save & Continue
            </button>
          </div>
        </div>
      </div>

      {/* AI Workflow Modal */}
      {showAIWorkflow && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-pink-50">
              <div className="flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-purple-600" />
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {refiningEntryIndex !== null ? 'Refine Entry with AI' : 'Extract Detailed Facts with AI'}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {refiningEntryIndex !== null
                      ? 'Get more granular facts/claims for better searchability'
                      : 'Process all entries to extract multiple discrete claims per entry'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAIWorkflow(false);
                  setAIWorkflowStep('info');
                  setRefiningEntryIndex(null);
                  setAIError(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Error Display */}
            {aiError && (
              <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-red-800">Error</h4>
                  <p className="text-sm text-red-700 mt-1 whitespace-pre-wrap">{aiError}</p>
                </div>
              </div>
            )}

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Step: Info/Instructions */}
              {aiWorkflowStep === 'info' && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-900 mb-2">📚 Why Use AI Extraction?</h4>
                    <ul className="text-sm text-blue-800 space-y-2">
                      <li>• <strong>Better Search:</strong> Creates 3-10 discrete facts per entry instead of 1-2 big blocks</li>
                      <li>• <strong>Granular Claims:</strong> Each game mechanic, requirement, or lore element becomes searchable</li>
                      <li>• <strong>Contextual Analysis:</strong> AI understands D&D mechanics and extracts intelligently</li>
                      <li>• <strong>Source Attribution:</strong> Each fact tracked with proper source reference</li>
                    </ul>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-semibold text-yellow-900 mb-2">📝 How It Works</h4>
                    <ol className="text-sm text-yellow-800 space-y-2">
                      <li><strong>1.</strong> We generate a specialized AI prompt with your homebrew content</li>
                      <li><strong>2.</strong> You copy the prompt and paste into any AI (ChatGPT, Claude, Gemini, etc.)</li>
                      <li><strong>3.</strong> The AI returns structured JSON with detailed fact extraction</li>
                      <li><strong>4.</strong> We parse the response and update your entries</li>
                      <li><strong>5.</strong> Each entry gets multiple searchable claims in the library</li>
                    </ol>
                  </div>

                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <h4 className="font-semibold text-orange-900 mb-2">⚠️ For Large Files</h4>
                    <p className="text-sm text-orange-800 mb-2">
                      Processing extensive homebrew content? Break it into chunks:
                    </p>
                    <ul className="text-sm text-orange-800 space-y-1 ml-4">
                      <li>• Process 5-10 entries at a time for best results</li>
                      <li>• Use individual "Refine with AI" button per entry if needed</li>
                      <li>• Max 3 AI refinements per entry (prevents infinite loops)</li>
                      <li>• Can always edit manually if AI misunderstands something</li>
                    </ul>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() => {
                        setShowAIWorkflow(false);
                        setAIWorkflowStep('info');
                      }}
                      className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => generateAIPrompt(refiningEntryIndex)}
                      className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium"
                    >
                      Generate AI Prompt →
                    </button>
                  </div>
                </div>
              )}

              {/* Step: Copy Prompt */}
              {aiWorkflowStep === 'copy-prompt' && (
                <div className="space-y-4">
                  <p className="text-gray-700">
                    <strong>Step 1:</strong> Copy this prompt and paste it into your AI chat (ChatGPT, Claude, Gemini, etc.)
                  </p>

                  <div className="relative">
                    <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs whitespace-pre-wrap font-mono max-h-96 overflow-auto">
                      {aiPromptText}
                    </pre>
                    <button
                      onClick={handleCopyAIPrompt}
                      disabled={copiedAIPrompt}
                      className={`absolute top-2 right-2 flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        copiedAIPrompt
                          ? 'bg-green-100 text-green-700 cursor-default'
                          : 'bg-purple-600 text-white hover:bg-purple-700'
                      }`}
                    >
                      {copiedAIPrompt ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy Prompt
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setAIWorkflowStep('info')}
                      className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100"
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}

              {/* Step: Paste Response */}
              {aiWorkflowStep === 'paste-response' && (
                <div className="space-y-4">
                  <p className="text-gray-700">
                    <strong>Step 2:</strong> Paste the JSON response from your AI chat below
                  </p>

                  <textarea
                    value={aiResponseText}
                    onChange={(e) => setAIResponseText(e.target.value)}
                    placeholder='Paste AI response here (should be JSON like):
{
  "entities": [
    {
      "type": "rule",
      "canonical_name": "Vampiric Regeneration",
      "claims": [
        { "text": "Available at 3rd level", "source": "..." },
        { "text": "Grants regeneration equal to Constitution modifier", "source": "..." },
        ...
      ],
      "homebrew_metadata": { ... }
    }
  ]
}'
                    rows={16}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none font-mono text-xs"
                  />

                  <div className="flex gap-3">
                    <button
                      onClick={() => setAIWorkflowStep('copy-prompt')}
                      className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleAIResponse}
                      disabled={!aiResponseText.trim()}
                      className="flex-1 px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                    >
                      Process AI Response
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
