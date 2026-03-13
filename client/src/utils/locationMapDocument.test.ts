import { describe, expect, it } from 'vitest';
import {
  buildLocationMapBodyContent,
  getLocationSpaceColor,
  wrapLocationMapHtmlDocument,
} from './locationMapDocument';

describe('locationMapDocument', () => {
  it('maps common room functions to stable color schemes', () => {
    expect(getLocationSpaceColor('Great Hall')).toEqual({ bg: '#e3f2fd', border: '#1976d2' });
    expect(getLocationSpaceColor('Guard Barracks')).toEqual({ bg: '#ffebee', border: '#c62828' });
    expect(getLocationSpaceColor('Kitchen')).toEqual({ bg: '#fff9c4', border: '#f57f17' });
    expect(getLocationSpaceColor('Unknown Chamber')).toEqual({ bg: '#f5f5f5', border: '#9e9e9e' });
  });

  it('builds shared body content with progress and legend', () => {
    const body = buildLocationMapBodyContent(
      'Moon Keep',
      [{ name: 'Great Hall' }, { name: 'Kitchen' }],
      4,
      '<div>row-1</div><div>row-2</div>'
    );

    expect(body).toContain('Moon Keep');
    expect(body).toContain('2 of 4 spaces generated');
    expect(body).toContain('50% complete');
    expect(body).toContain('Legend');
    expect(body).toContain('row-1');
    expect(body).toContain('Important Rooms');
  });

  it('wraps body content only when a full document is requested', () => {
    const body = '<div>content</div>';

    expect(wrapLocationMapHtmlDocument('Moon Keep', body, true)).toBe(body);
    expect(wrapLocationMapHtmlDocument('Moon Keep', body, false)).toContain('<!DOCTYPE html>');
    expect(wrapLocationMapHtmlDocument('Moon Keep', body, false)).toContain('<title>Moon Keep - Map In Progress</title>');
  });
});
