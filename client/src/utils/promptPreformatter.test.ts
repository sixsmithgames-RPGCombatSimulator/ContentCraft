import { describe, expect, it } from 'vitest';
import { preformatPromptForAi } from './promptPreformatter';

describe('preformatPromptForAi', () => {
  it('preserves ordinary prose prompts apart from light normalization', () => {
    const result = preformatPromptForAi('A deadly dragon encounter near Waterdeep.');

    expect(result.kind).toBe('plain');
    expect(result.normalizedPrompt).toBe('A deadly dragon encounter near Waterdeep.');
  });

  it('formats valid JSON prompts into a readable structured brief', () => {
    const result = preformatPromptForAi('{"name":"Fiblan","level":10,"class":"Wizard"}');

    expect(result.kind).toBe('json');
    expect(result.normalizedPrompt).toContain('Structured brief:');
    expect(result.normalizedPrompt).toContain('name: Fiblan');
    expect(result.normalizedPrompt).toContain('level: 10');
    expect(result.normalizedPrompt).toContain('class: Wizard');
  });

  it('formats pasted key-value fragments into readable structured text', () => {
    const rawPrompt = [
      '"name": "Fiblan",',
      '"level": 10,',
      '"class": "Wizard",',
      '"abilities":',
      '  "strength": 8,',
      '  "dexterity": 14,',
      '"appearance":',
      '  "height": "5\'11\\\\\\"",',
      '  "eyes": "Gray",',
      '"backstory": "Born in Marenport."',
    ].join('\n');

    const result = preformatPromptForAi(rawPrompt);

    expect(result.kind).toBe('key-value-fragment');
    expect(result.normalizedPrompt).toContain('Structured brief:');
    expect(result.normalizedPrompt).toContain('name: Fiblan');
    expect(result.normalizedPrompt).toContain('abilities:');
    expect(result.normalizedPrompt).toContain('strength: 8');
    expect(result.normalizedPrompt).toContain('height: 5\'11"');
    expect(result.normalizedPrompt).toContain('backstory: Born in Marenport.');
  });
});
