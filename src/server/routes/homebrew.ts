/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { createRequire } from 'module';
import { logger } from '../utils/logger.js';
import { parseHomebrewChunk, parseTextToEntry } from '../parsers/homebrewParser.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const require = createRequire(import.meta.url);

export const homebrewRouter = Router();

// Apply auth middleware to all routes
homebrewRouter.use(authMiddleware);

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and text files are allowed'));
    }
  },
});

interface HomebrewChunk {
  index: number;
  title: string;
  content: string;
  prompt: string;
}

interface ChunkResponse {
  chunks: HomebrewChunk[];
  totalChunks: number;
  fileName: string;
  fileSize: number;
}

/**
 * Splits text into logical chunks based on headers and size
 */
function chunkText(text: string, maxChunkSize = 4000): HomebrewChunk[] {
  const chunks: HomebrewChunk[] = [];

  // Split by major headers (lines that look like headings)
  const lines = text.split('\n');
  let currentChunk = '';
  let currentTitle = 'Introduction';
  let chunkIndex = 0;
  let foundFirstHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect headers (all caps, short lines, or lines ending with certain patterns)
    const isHeader =
      (line.length > 0 && line.length < 60 && line === line.toUpperCase()) ||
      /^(Chapter|Part|Section|\d+\.)/.test(line) ||
      /^[A-Z][a-z\s]+:$/.test(line);

    // Save chunk when we find a header (after the first one, or if chunk is large enough)
    if (isHeader && (foundFirstHeader || currentChunk.length > 500)) {
      // Save previous chunk
      const content = currentChunk.trim();
      if (content.length > 0) {
        chunks.push({
          index: chunkIndex,
          title: currentTitle,
          content: content,
          prompt: buildChunkPrompt(currentTitle, content, chunkIndex),
        });
        chunkIndex++;
      }

      // Start new chunk - header becomes title, content starts empty
      currentChunk = '';
      currentTitle = line;
      foundFirstHeader = true;
    } else if (!isHeader) {
      // Only add non-header lines to content
      currentChunk += line + '\n';

      // If chunk is getting too large, split it
      if (currentChunk.length > maxChunkSize) {
        const content = currentChunk.trim();
        const partNum = chunks.filter(c => c.title.startsWith(currentTitle)).length + 1;
        chunks.push({
          index: chunkIndex,
          title: currentTitle + ' (Part ' + partNum + ')',
          content: content,
          prompt: buildChunkPrompt(currentTitle, content, chunkIndex),
        });
        chunkIndex++;
        currentChunk = '';
      }
    }
  }

  // Add final chunk
  const finalContent = currentChunk.trim();
  if (finalContent.length > 0) {
    chunks.push({
      index: chunkIndex,
      title: currentTitle,
      content: finalContent,
      prompt: buildChunkPrompt(currentTitle, finalContent, chunkIndex),
    });
  }

  return chunks;
}

/**
 * Builds an extraction prompt for a specific chunk with emphasis on multiple discrete claims
 */
function buildChunkPrompt(title: string, content: string, index: number): string {
  return `You are a D&D homebrew content extraction expert.
Your job is to analyze homebrew D&D 5e content and extract MULTIPLE discrete facts/claims per entity.

CRITICAL: Break down information into ATOMIC FACTS (1-2 sentences each)
- BAD: One giant claim with all information
- GOOD: Multiple small claims, each describing ONE specific aspect

SECTION: ${title} (Chunk ${index + 1})

CONTENT:
${content}

INSTRUCTIONS:
For homebrew entries, extract:
1. TYPE & NAME: Canonical name and entity type
2. MULTIPLE CLAIMS: Break description into discrete, searchable facts
   - Each mechanical rule = separate claim
   - Each lore element = separate claim
   - Each requirement/prerequisite = separate claim
   - Target 3-10 discrete claims per entry (not just 1-2)

EXAMPLE - GOOD EXTRACTION:
Input: "Vampiric Regeneration: At 3rd level, you gain regeneration equal to your Constitution modifier. This doesn't work in sunlight."

Output:
{
  "canonical_name": "Vampiric Regeneration",
  "type": "character_option",
  "claims": [
    { "text": "Vampiric Regeneration is available at 3rd level.", "source": "SECTION:${title}" },
    { "text": "You gain regeneration equal to your Constitution modifier.", "source": "SECTION:${title}" },
    { "text": "Vampiric Regeneration does not function in sunlight.", "source": "SECTION:${title}" }
  ],
  "homebrew_metadata": {
    "homebrew_type": "feat",
    "tags": ["vampire", "regeneration", "level 3"],
    "short_summary": "Grants vampiric regeneration at 3rd level.",
    "full_description": "At 3rd level, you gain regeneration equal to your Constitution modifier. This doesn't work in sunlight."
  }
}

HOMEBREW TYPES TO MAP:
- race/subrace/class/subclass/feat/background → "character_option"
- spell → "spell"
- item → "item"
- creature → "creature"
- lore → "lore"
- rule → "rule"

OUTPUT STRUCTURE (STRICTLY valid JSON):
{
  "entities": [
    {
      "type": "character_option | spell | item | creature | lore | rule",
      "canonical_name": "Entry Name",
      "aliases": ["Alternative Name"],
      "claims": [
        { "text": "Discrete fact 1", "source": "SECTION:${title}" },
        { "text": "Discrete fact 2", "source": "SECTION:${title}" },
        { "text": "Discrete fact 3", "source": "SECTION:${title}" }
      ],
      "homebrew_metadata": {
        "homebrew_type": "original type from source",
        "tags": ["tag1", "tag2"],
        "short_summary": "Brief one-sentence summary",
        "full_description": "Complete original description for reference",
        "assumptions": ["Any parsing assumptions"],
        "notes": ["Any extraction notes"]
      }
    }
  ]
}

IMPORTANT:
- Create 3-10 discrete claims per entry
- Each claim should be independently searchable
- Use source attribution: "SECTION:${title}"
- Include homebrew_metadata with original content
- Preserve EXACT wording for game mechanics
- Output ONLY valid JSON`;
}

/**
 * POST /api/homebrew/chunk
 * Upload and chunk a homebrew PDF or text file
 */
homebrewRouter.post('/chunk', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const authReq = req as unknown as AuthRequest;
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    logger.info(`Processing homebrew file: ${req.file.originalname} (${req.file.size} bytes)`);

    let text = '';

    // Extract text based on file type
    if (req.file.mimetype === 'application/pdf') {
      // Use require for CommonJS module
      const pdfParse = require('pdf-parse');
      const pdfData = await pdfParse(req.file.buffer);
      text = pdfData.text;
    } else if (req.file.mimetype === 'text/plain') {
      text = req.file.buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Clean up text
    text = text
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, '  ')
      .trim();

    if (text.length === 0) {
      return res.status(400).json({ error: 'File appears to be empty or text could not be extracted' });
    }

    logger.info(`Extracted ${text.length} characters from ${req.file.originalname}`);

    // Chunk the text
    const chunks = chunkText(text);

    logger.info(`Created ${chunks.length} chunks from ${req.file.originalname}`);

    const response: ChunkResponse = {
      chunks,
      totalChunks: chunks.length,
      fileName: req.file.originalname,
      fileSize: req.file.size,
    };

    res.json(response);
  } catch (error) {
    logger.error('Error processing homebrew file:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('Error details:', { message: errorMessage, stack: errorStack });
    res.status(500).json({
      error: 'Failed to process file',
      message: errorMessage,
    });
  }
});

/**
 * POST /api/homebrew/parse
 * Auto-parse a chunk of homebrew content
 */
homebrewRouter.post('/parse', async (req: Request, res: Response) => {
  try {
    const { chunkIndex, sectionTitle, content } = req.body;

    if (typeof chunkIndex !== 'number' || typeof sectionTitle !== 'string' || typeof content !== 'string') {
      return res.status(400).json({ error: 'Missing required fields: chunkIndex, sectionTitle, content' });
    }

    logger.info(`Auto-parsing chunk ${chunkIndex}: ${sectionTitle}`);

    const parsed = parseHomebrewChunk(chunkIndex, sectionTitle, content);

    logger.info(`Parsed chunk ${chunkIndex}: ${parsed.notes}`);

    res.json(parsed);
  } catch (error) {
    logger.error('Error auto-parsing homebrew chunk:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      error: 'Failed to parse chunk',
      message: errorMessage,
    });
  }
});

/**
 * POST /api/homebrew/parse-text
 * Parse a text snippet into entry details (for merge/split operations)
 */
homebrewRouter.post('/parse-text', async (req: Request, res: Response) => {
  try {
    const { text, contextType } = req.body;

    if (typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing required field: text' });
    }

    logger.info(`Parsing text snippet (${text.length} chars)`);

    const parsed = parseTextToEntry(text, contextType);

    res.json(parsed);
  } catch (error) {
    logger.error('Error parsing text snippet:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      error: 'Failed to parse text',
      message: errorMessage,
    });
  }
});

