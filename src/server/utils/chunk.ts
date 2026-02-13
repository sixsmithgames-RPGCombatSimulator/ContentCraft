/**
 * Split text into coherent chunks suitable for retrieval
 * Aims for 1-5 sentences per chunk
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */
export function chunkText(
  text: string,
  options: {
    maxSentences?: number;
    minChunkLength?: number;
    maxChunkLength?: number;
  } = {}
): string[] {
  const { maxSentences = 5, minChunkLength = 50, maxChunkLength = 500 } = options;

  // Split into sentences (basic approach)
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const sentence of sentences) {
    const sentenceLength = sentence.length;

    // If adding this sentence exceeds limits, finalize current chunk
    if (
      currentChunk.length >= maxSentences ||
      (currentLength + sentenceLength > maxChunkLength && currentLength >= minChunkLength)
    ) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
      }
      currentChunk = [sentence];
      currentLength = sentenceLength;
    } else {
      currentChunk.push(sentence);
      currentLength += sentenceLength + 1; // +1 for space
    }
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  return chunks.filter(chunk => chunk.length >= minChunkLength);
}

/**
 * Extract key information from text for indexing
 */
export function extractKeywords(text: string, maxKeywords: number = 10): string[] {
  // Simple keyword extraction: filter out common words, take frequent ones
  const commonWords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
    'as',
    'is',
    'was',
    'are',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'can',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
    'they',
    'them',
    'their',
    'he',
    'she',
    'his',
    'her',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !commonWords.has(w));

  const freq: Record<string, number> = {};
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}
