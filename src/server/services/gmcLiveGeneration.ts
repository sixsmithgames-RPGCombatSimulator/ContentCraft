const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';

function parseJson(text: string): any {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

export async function generateStructuredJson(systemInstruction: string, input: unknown): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) throw Object.assign(new Error('Gemini API key is not configured.'), { status: 503, code: 'GMC_UNAVAILABLE' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: `${systemInstruction}\nReturn exactly one complete valid JSON object. Do not use markdown fences.${attempt ? ' This is a retry: use the simplest valid structure that satisfies every required key.' : ''}` }] },
          contents: [{ parts: [{ text: JSON.stringify(input) }] }],
          generationConfig: { temperature: attempt ? 0.2 : 0.6, maxOutputTokens: 8192, responseMimeType: 'application/json' },
        }),
      });
      if (!response.ok) throw Object.assign(new Error(`Gemini returned ${response.status}.`), { status: 502, code: 'GMC_UNAVAILABLE' });
      const body = await response.json() as any;
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        if (attempt === 0) continue;
        throw Object.assign(new Error('Gemini returned no structured content.'), { status: 502, code: 'STRUCTURED_OUTPUT_INVALID' });
      }
      try { return parseJson(text); }
      catch {
        if (attempt === 0) continue;
        throw Object.assign(new Error('Gemini returned invalid JSON after a constrained retry.'), { status: 502, code: 'STRUCTURED_OUTPUT_INVALID' });
      }
    }
    throw Object.assign(new Error('Gemini returned no usable structured content.'), { status: 502, code: 'STRUCTURED_OUTPUT_INVALID' });
  } finally { clearTimeout(timeout); }
}

export const generationPrompts = {
  npc: 'Create a campaign NPC with name, role, motivation, secrets, relationships, voice, appearance, currentLocationId, arcSummary, status, combatProfile, claims, and tags.',
  location: 'Create a campaign location with name, description, parentLocationId, atmosphere, features, secrets, inhabitants, hooks, claims, and tags.',
  item: 'Create a campaign item with name, description, rarity, lore, properties, suggestedVcsPayload, claims, and tags.',
};
