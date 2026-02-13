/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

// import { openai } from '../config/openai.js';

/**
 * Generate embeddings for text using OpenAI's embedding model
 */
export async function generateEmbedding(_text: string): Promise<number[]> {
  throw new Error('generateEmbedding disabled: OpenAI integration is commented out.');
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(_texts: string[]): Promise<number[][]> {
  throw new Error('generateEmbeddings disabled: OpenAI integration is commented out.');
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Find top-k most similar chunks by cosine similarity
 */
export function findTopKSimilar(
  queryEmbedding: number[],
  chunks: Array<{ embedding: number[]; [key: string]: any }>,
  k: number = 10
): Array<{ chunk: any; similarity: number }> {
  const scored = chunks
    .filter(chunk => chunk.embedding && chunk.embedding.length > 0)
    .map(chunk => ({
      chunk,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, k);
}
