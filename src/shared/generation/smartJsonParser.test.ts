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

  it('repairs unescaped dialogue quotes inside a JSON string value', () => {
    const input = '{"responseMode":"in_character","responseText":"Thorne nods. "Agreed. We move now." She points ahead. "Then let us ruin their night."","rollRequest":null}';
    const parsed = parseSmartJson(input, { requireObject: true });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect((parsed.value as any).responseText).toBe('Thorne nods. "Agreed. We move now." She points ahead. "Then let us ruin their night."');
      expect(parsed.warnings).toContain('repair:escaped_unescaped_string_quotes');
    }
  });

  it('removes file-search citation placeholders without losing surrounding JSON', () => {
    const input = '{"responseMode":"in_character","responseText":"Proceed :contentReference[oaicite:0]{index=0} now.","rollRequest":null}';
    const parsed = parseSmartJson(input, { requireObject: true });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect((parsed.value as any).responseText).toBe('Proceed  now.');
      expect(parsed.warnings).toContain('repair:removed_citation_artifacts');
    }
  });
});
