/**
 * Auto-parser for D&D 5e homebrew content
 * Implements detailed extraction spec for vampire and other homebrew content
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export interface HomebrewEntry {
  type: 'race' | 'subrace' | 'class' | 'subclass' | 'feat' | 'spell' | 'item' | 'creature' | 'rule' | 'lore' | 'background';
  title: string;
  short_summary: string;
  long_description: string;
  tags: string[];
  assumptions: string[];
  notes: string[];
  lineNumber?: number; // Track original position in document
  section_title?: string; // Track which section this entry came from
  chunk_index?: number; // Track which chunk this entry came from
}

export interface ParsedHomebrewContent {
  chunk_index: number;
  section_title: string;
  entries: HomebrewEntry[];
  notes: string;
  unparsed: string[];
}

interface Section {
  heading: string;
  content: string[];
  level: number;
  lineStart: number;
}

/**
 * Detect if a line is a heading
 */
function isHeading(line: string, nextLine?: string): { isHeading: boolean; level: number } {
  const trimmed = line.trim();

  if (trimmed.length === 0) return { isHeading: false, level: 0 };

  // All caps (short enough to be a heading)
  if (trimmed.length > 2 && trimmed.length < 80 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
    // Check if followed by content (not another all-caps line)
    if (nextLine && nextLine.trim().length > 0 && nextLine.trim() !== nextLine.trim().toUpperCase()) {
      return { isHeading: true, level: 1 };
    }
  }

  // Title Case followed by blank line or content
  if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*(\s*[\(:])?$/.test(trimmed) && trimmed.length < 60) {
    return { isHeading: true, level: 2 };
  }

  // Starts with "Chapter", "Part", "Section", number followed by dot
  if (/^(Chapter|Part|Section|\d+\.)\s+/i.test(trimmed)) {
    return { isHeading: true, level: 1 };
  }

  // Ends with colon and is reasonably short (subsection)
  if (trimmed.endsWith(':') && trimmed.length < 60 && /^[A-Z]/.test(trimmed)) {
    return { isHeading: true, level: 3 };
  }

  return { isHeading: false, level: 0 };
}

/**
 * Detect if a line starts a list item
 */
function isListItem(line: string): boolean {
  const trimmed = line.trim();
  // Starts with dash, bullet, asterisk, or number followed by period or parenthesis
  return /^[-•*]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed);
}

/**
 * Extract list item name and description
 */
function parseListItem(line: string): { name: string; description: string } {
  const trimmed = line.trim();
  // Remove list marker
  const withoutMarker = trimmed.replace(/^[-•*]\s+/, '').replace(/^\d+[.)]\s+/, '');

  // Try to split on first period, colon, dash, or em-dash
  const splitMatch = withoutMarker.match(/^([^.:\-–—]+)[.:\-–—]\s*(.*)$/);
  if (splitMatch) {
    return { name: splitMatch[1].trim(), description: splitMatch[2].trim() };
  }

  // If no clear separator, treat whole line as name
  return { name: withoutMarker.trim(), description: '' };
}

/**
 * Determine if content is narrative lore vs mechanical rules
 */
function isLore(text: string): boolean {
  const lowerText = text.toLowerCase();

  // Lore indicators: narrative language, past tense, personality, story elements
  const lorePatterns = [
    /once (a|an|the)/i,
    /was (a|an|the)/i,
    /personality/i,
    /memory|memories/i,
    /story|tale|legend/i,
    /kills the original/i,
    /produces an inverted/i,
  ];

  // Rule indicators: game mechanics, numbers, advantage/disadvantage, ability scores
  const rulePatterns = [
    /\d+d\d+/i, // dice notation
    /hp|hit points/i,
    /advantage|disadvantage/i,
    /ability score/i,
    /proficiency bonus/i,
    /ac |armor class/i,
    /saving throw|save/i,
    /damage|resistance/i,
    /per (long|short) rest/i,
    /bonus action|reaction|action/i,
    /level \d+/i,
  ];

  const loreScore = lorePatterns.filter(p => p.test(text)).length;
  const ruleScore = rulePatterns.filter(p => p.test(text)).length;

  // If more lore patterns than rule patterns, consider it lore
  return loreScore > ruleScore;
}

/**
 * Generate tags from content
 */
function generateTags(title: string, description: string, contextHeading?: string): string[] {
  const tags: string[] = [];
  const text = `${title} ${description} ${contextHeading || ''}`.toLowerCase();

  // Common keywords
  const keywords = [
    'vampire', 'vampiric', 'undead', 'bloodline',
    'power', 'weakness', 'trait', 'ability',
    'darkvision', 'regeneration', 'resistance', 'immunity',
    'speed', 'advantage', 'disadvantage',
    'holy', 'divine', 'sunlight', 'stake',
    'charm', 'fear', 'frightened',
    'celerity', 'mist', 'bat', 'wolf',
    'race', 'subrace', 'class', 'spell', 'feat',
  ];

  keywords.forEach(keyword => {
    if (text.includes(keyword)) {
      tags.push(keyword);
    }
  });

  // Extract level requirements
  const levelMatch = text.match(/level (\d+)/i);
  if (levelMatch) {
    tags.push(`level ${levelMatch[1]}`);
  }

  // Extract numeric prerequisites
  if (/\d+th level/i.test(text) || /9th level/i.test(text)) {
    const numMatch = text.match(/(\d+)(?:st|nd|rd|th) level/i);
    if (numMatch) tags.push(`level ${numMatch[1]}`);
  }

  // Add context from heading
  if (contextHeading) {
    const headingLower = contextHeading.toLowerCase();
    if (headingLower.includes('power')) tags.push('power');
    if (headingLower.includes('weakness')) tags.push('weakness');
    if (headingLower.includes('trait')) tags.push('trait');
    if (headingLower.includes('bloodline')) tags.push('bloodline');
  }

  return [...new Set(tags)]; // Remove duplicates
}

/**
 * Determine entry type based on context and content
 */
function determineType(
  itemName: string,
  description: string,
  contextHeading: string,
  parentHeading?: string
): HomebrewEntry['type'] {
  const heading = contextHeading.toLowerCase();
  const parent = (parentHeading || '').toLowerCase();
  const combined = `${heading} ${parent}`.toLowerCase();

  // Check context headings
  if (combined.includes('racial trait') || combined.includes('vampire') && combined.includes('trait')) {
    return 'race';
  }
  if (combined.includes('subrace') || combined.includes('bloodline')) {
    return 'subrace';
  }
  if (combined.includes('vampiric power') || heading.includes('power')) {
    return 'rule';
  }
  if (combined.includes('vampiric weakness') || heading.includes('weakness')) {
    return 'rule';
  }
  if (combined.includes('spell')) {
    return 'spell';
  }
  if (combined.includes('feat')) {
    return 'feat';
  }
  if (combined.includes('item') || combined.includes('equipment')) {
    return 'item';
  }
  if (combined.includes('monster') || combined.includes('creature') || combined.includes('stat block')) {
    return 'creature';
  }
  if (combined.includes('class') && !combined.includes('subclass')) {
    return 'class';
  }
  if (combined.includes('subclass')) {
    return 'subclass';
  }
  if (combined.includes('background')) {
    return 'background';
  }

  // Check content
  if (isLore(description)) {
    return 'lore';
  }

  // Default to rule for mechanical content
  return 'rule';
}

/**
 * Create a summary from description (first 1-2 sentences)
 */
function createSummary(description: string): string {
  if (!description) return '';

  // Find first period followed by space or end
  const sentences = description.split(/\.\s+/);
  if (sentences.length === 0) return description.substring(0, 150);

  const firstSentence = sentences[0] + '.';
  if (firstSentence.length > 150) {
    return firstSentence.substring(0, 147) + '...';
  }

  // If first sentence is very short, include second
  if (firstSentence.length < 50 && sentences.length > 1) {
    const secondSentence = sentences[1] + '.';
    const combined = firstSentence + ' ' + secondSentence;
    if (combined.length > 200) {
      return combined.substring(0, 197) + '...';
    }
    return combined;
  }

  return firstSentence;
}

/**
 * Split document into sections based on headings
 */
function splitIntoSections(text: string): Section[] {
  const lines = text.split('\n');
  const sections: Section[] = [];
  let currentSection: Section | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : undefined;
    const { isHeading: isHead, level } = isHeading(line, nextLine);

    if (isHead) {
      // Save previous section
      if (currentSection) {
        sections.push(currentSection);
      }

      // Start new section
      currentSection = {
        heading: line.trim(),
        content: [],
        level,
        lineStart: i,
      };
    } else if (currentSection) {
      // Add line to current section
      currentSection.content.push(line);
    } else {
      // Content before first heading - create an "Introduction" section
      if (!currentSection) {
        currentSection = {
          heading: 'Introduction',
          content: [line],
          level: 1,
          lineStart: 0,
        };
      }
    }
  }

  // Add final section
  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Parse a section into entries
 */
function parseSection(section: Section, chunkIndex: number, chunkSectionTitle: string, parentSection?: Section): HomebrewEntry[] {
  const entries: HomebrewEntry[] = [];
  const assumptions: string[] = [];
  const notes: string[] = [];

  const contentText = section.content.join('\n').trim();
  if (!contentText) return entries;

  // Check if this section contains list items
  const lines = section.content;
  let currentListItem: { name: string; description: string[]; startLine: number } | null = null;
  const listItems: Array<{ name: string; description: string; lineNumber: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (isListItem(line)) {
      // Save previous list item
      if (currentListItem) {
        listItems.push({
          name: currentListItem.name,
          description: currentListItem.description.join(' ').trim(),
          lineNumber: section.lineStart + currentListItem.startLine,
        });
      }

      // Start new list item
      const parsed = parseListItem(line);
      currentListItem = {
        name: parsed.name,
        description: parsed.description ? [parsed.description] : [],
        startLine: i,
      };
    } else if (currentListItem) {
      // Continue current list item description
      currentListItem.description.push(line);
    }
  }

  // Save final list item
  if (currentListItem) {
    listItems.push({
      name: currentListItem.name,
      description: currentListItem.description.join(' ').trim(),
      lineNumber: section.lineStart + currentListItem.startLine,
    });
  }

  // If we found list items, create entries from them
  if (listItems.length > 0) {
    listItems.forEach(item => {
      const fullDescription = item.description || item.name;
      const type = determineType(item.name, fullDescription, section.heading, parentSection?.heading);
      const tags = generateTags(item.name, fullDescription, section.heading);

      entries.push({
        type,
        title: item.name,
        short_summary: createSummary(fullDescription),
        long_description: fullDescription,
        tags,
        assumptions: [],
        notes: [],
        lineNumber: item.lineNumber,
        section_title: chunkSectionTitle,
        chunk_index: chunkIndex,
      });
    });

    if (listItems.length > 0) {
      assumptions.push(`Extracted ${listItems.length} items from list under "${section.heading}"`);
    }
  } else {
    // No list items - treat the whole section as a single entry
    const type = isLore(contentText) ? 'lore' : determineType('', contentText, section.heading, parentSection?.heading);
    const tags = generateTags(section.heading, contentText, parentSection?.heading);

    entries.push({
      type,
      title: section.heading,
      short_summary: createSummary(contentText),
      long_description: contentText,
      tags,
      assumptions,
      notes,
      lineNumber: section.lineStart,
      section_title: chunkSectionTitle,
      chunk_index: chunkIndex,
    });
  }

  return entries;
}

/**
 * Main parsing function
 */
export function parseHomebrewChunk(chunkIndex: number, sectionTitle: string, content: string): ParsedHomebrewContent {
  const result: ParsedHomebrewContent = {
    chunk_index: chunkIndex,
    section_title: sectionTitle,
    entries: [],
    notes: '',
    unparsed: [],
  };

  try {
    // Split into sections
    const sections = splitIntoSections(content);

    if (sections.length === 0) {
      result.unparsed.push(content);
      result.notes = 'No sections detected. Content added to unparsed field.';
      return result;
    }

    // Parse each section
    sections.forEach((section, index) => {
      const parentSection = index > 0 ? sections[index - 1] : undefined;
      const entries = parseSection(section, chunkIndex, sectionTitle, parentSection);
      result.entries.push(...entries);
    });

    // Sort entries by line number to preserve document order
    result.entries.sort((a, b) => {
      const aLine = a.lineNumber ?? 0;
      const bLine = b.lineNumber ?? 0;
      return aLine - bLine;
    });

    if (result.entries.length === 0) {
      result.unparsed.push(content);
      result.notes = 'No structured content detected. Content added to unparsed field.';
    } else {
      const typeCount: Record<string, number> = {};
      result.entries.forEach(entry => {
        typeCount[entry.type] = (typeCount[entry.type] || 0) + 1;
      });

      const summary = Object.entries(typeCount)
        .map(([type, count]) => `${count} ${type}${count !== 1 ? 's' : ''}`)
        .join(', ');

      result.notes = `Auto-parsed: ${summary} (${result.entries.length} total entries)`;
    }
  } catch (error) {
    result.unparsed.push(content);
    result.notes = `Parsing error: ${error instanceof Error ? error.message : String(error)}`;
  }

  return result;
}

/**
 * Utility function to parse raw text into an entry
 * Used for re-parsing during merge/split operations
 */
export function parseTextToEntry(text: string, contextType?: string): Partial<HomebrewEntry> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      type: 'rule',
      title: 'Untitled',
      short_summary: '',
      long_description: '',
      tags: [],
      assumptions: [],
      notes: [],
    };
  }

  // Try to extract a title from the first line or sentence
  const lines = trimmed.split('\n');
  let title = 'Untitled';
  let description = trimmed;

  // Check if first line looks like a title (short, capitalized, possibly ends with colon)
  const firstLine = lines[0].trim();
  if (firstLine.length > 0 && firstLine.length < 80) {
    // If it's short and looks like a heading, use it as title
    if (firstLine === firstLine.toUpperCase() || firstLine.match(/^[A-Z][a-z\s]+:?$/)) {
      title = firstLine.replace(/:$/, '');
      description = lines.slice(1).join('\n').trim();
    } else {
      // Try to get first few words as title
      const words = firstLine.split(/\s+/);
      if (words.length <= 6) {
        title = firstLine;
        description = lines.slice(1).join('\n').trim() || firstLine;
      }
    }
  }

  // Determine type
  const type = contextType || (isLore(description) ? 'lore' : 'rule');

  // Generate tags and summary
  const tags = generateTags(title, description);
  const summary = createSummary(description);

  return {
    type: type as HomebrewEntry['type'],
    title,
    short_summary: summary,
    long_description: description,
    tags,
    assumptions: ['Re-parsed from split/merge operation'],
    notes: [],
  };
}
