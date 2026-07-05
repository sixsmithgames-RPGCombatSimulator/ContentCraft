import { describe, expect, it } from 'vitest';
import { parseSmartJson } from './smartJsonParser.js';

describe('parseSmartJson', () => {
  it('preserves smart quotes inside an already-valid JSON string', () => {
    const input = '{"responseMode":"retcon","responseText":"Between them, she finds crate marks: “GH-7,” “GH-9,” and “black seal — sewer handoff.”","rollRequest":null}';
    const parsed = parseSmartJson(input, { requireObject: true });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect((parsed.value as any).responseMode).toBe('retcon');
      expect((parsed.value as any).responseText).toContain('“GH-7,”');
      expect(parsed.repaired).toBe(false);
    }
  });

  it('repairs common web-model JSON paste damage', () => {
    const input = `Here is the JSON:
\`\`\`json
{
  responseMode: 'ooc', // model commentary
  responseText: 'Ready',
  rollRequest: None,
}
\`\`\``;
    const parsed = parseSmartJson(input, { requireObject: true });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect((parsed.value as any).responseText).toBe('Ready');
      expect((parsed.value as any).rollRequest).toBeNull();
      expect(parsed.repaired).toBe(true);
      expect(parsed.warnings.length).toBeGreaterThan(0);
    }
  });

  it('repairs smart quotes used as JSON syntax', () => {
    const parsed = parseSmartJson('{ “responseMode”: “in_character”, “responseText”: “Done”, }', { requireObject: true });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect((parsed.value as any).responseText).toBe('Done');
  });
});
