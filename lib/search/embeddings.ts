// pgvector embedding infrastructure
// Generates text embeddings using OpenAI's text-embedding-3-small model.
// Falls back gracefully if OPENAI_API_KEY is not set — vectorScore stays 0.
//
// Prerequisites:
// 1. Enable pgvector extension in your Supabase/Neon DB:
//    CREATE EXTENSION IF NOT EXISTS vector;
// 2. Run the migration in prisma/migrations/add_embeddings/migration.sql
// 3. Set OPENAI_API_KEY in your environment variables.

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 256; // use small dimensions for speed/cost

/**
 * Check if embedding generation is available (OpenAI API key is set).
 */
export function isEmbeddingAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/**
 * Generate an embedding vector for the given text using OpenAI's API.
 * Returns null if the API key is not configured or the call fails.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    // Truncate to ~8000 tokens (~32000 chars) to stay within limits
    const truncated = text.slice(0, 32000);

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: truncated,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`OpenAI Embeddings API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch (err) {
    console.warn('Embedding generation failed:', err);
    return null;
  }
}

/**
 * Generate embeddings for multiple texts in a single batch call.
 * More efficient than individual calls.
 */
export async function generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return texts.map(() => null);

  try {
    // Truncate each text
    const truncated = texts.map((t) => t.slice(0, 8000));

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: truncated,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`OpenAI Embeddings batch API returned ${response.status}`);
      return texts.map(() => null);
    }

    const data = await response.json();
    const embeddings: (number[] | null)[] = texts.map(() => null);

    for (const item of data?.data ?? []) {
      if (item.index < embeddings.length && item.embedding) {
        embeddings[item.index] = item.embedding;
      }
    }

    return embeddings;
  } catch (err) {
    console.warn('Batch embedding generation failed:', err);
    return texts.map(() => null);
  }
}

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical direction).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Compute vector scores for a list of result embeddings against a query embedding.
 * Returns an array of scores (0–1), or all zeros if embeddings are unavailable.
 */
export function computeVectorScores(
  queryEmbedding: number[] | null,
  resultEmbeddings: (number[] | null)[]
): number[] {
  if (!queryEmbedding) return resultEmbeddings.map(() => 0);

  return resultEmbeddings.map((emb) => {
    if (!emb) return 0;
    // Cosine similarity returns -1 to 1; normalize to 0-1 range
    return Math.max(0, cosineSimilarity(queryEmbedding, emb));
  });
}
