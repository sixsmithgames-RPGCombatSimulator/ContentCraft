const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';

function parseJson(text: string): any {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

export async function generateStructuredJson(systemInstruction: string, input: unknown): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) throw Object.assign(new Error('Gemini API key is not configured.'), { status: 503, code: 'GMC_UNAVAILABLE' });
  let lastError: any = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: `${systemInstruction}\nReturn exactly one complete valid JSON object. Do not use markdown fences.${attempt ? ' This is a retry: use the simplest valid structure that satisfies every required key.' : ''}` }] },
          contents: [{ parts: [{ text: JSON.stringify(input) }] }],
          generationConfig: { temperature: attempt ? 0.2 : 0.6, maxOutputTokens: 8192, responseMimeType: 'application/json' },
        }),
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        const error = Object.assign(new Error(`Gemini returned ${response.status}.`), {
          status: retryable ? 503 : 502,
          code: retryable ? 'GMC_TEMPORARILY_UNAVAILABLE' : 'GMC_UNAVAILABLE',
        });
        if (retryable && attempt === 0) { lastError = error; continue; }
        throw error;
      }
      const body = await response.json() as any;
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        if (attempt === 0) { lastError = Object.assign(new Error('Gemini returned no structured content.'), { status: 502, code: 'STRUCTURED_OUTPUT_INVALID' }); continue; }
        throw Object.assign(new Error('Gemini returned no structured content.'), { status: 502, code: 'STRUCTURED_OUTPUT_INVALID' });
      }
      try { return parseJson(text); }
      catch {
        if (attempt === 0) { lastError = Object.assign(new Error('Gemini returned invalid JSON.'), { status: 502, code: 'STRUCTURED_OUTPUT_INVALID' }); continue; }
        throw Object.assign(new Error('Gemini returned invalid JSON after a constrained retry.'), { status: 502, code: 'STRUCTURED_OUTPUT_INVALID' });
      }
    } catch (error: any) {
      const transient = error?.name === 'AbortError' || error?.code === 'GMC_TEMPORARILY_UNAVAILABLE';
      if (transient && attempt === 0) { lastError = error; continue; }
      if (error?.name === 'AbortError') {
        throw Object.assign(new Error('Gemini timed out after a retry.'), { status: 504, code: 'GMC_TIMEOUT' });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? Object.assign(new Error('Gemini returned no usable structured content.'), { status: 502, code: 'STRUCTURED_OUTPUT_INVALID' });
}

export const generationPrompts = {
  npc: 'Create a campaign NPC with name, role, motivation, secrets, relationships, voice, appearance, currentLocationId, arcSummary, status, combatProfile, claims, and tags.',
  location: 'Create a campaign location with name, description, parentLocationId, atmosphere, features, secrets, inhabitants, hooks, claims, and tags.',
  item: 'Create a campaign item with name, description, rarity, lore, properties, suggestedVcsPayload, claims, and tags.',
};
