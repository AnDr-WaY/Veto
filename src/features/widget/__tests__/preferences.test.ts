/**
 * Widget preferences: App Group roundtrip, unknown-value fallbacks, and the
 * key-for-key contract with the Swift widget (targets/DayLeftWidget). Live
 * seconds are deliberately absent — the choice belongs to which of the two
 * gallery widgets is placed, not to a stored preference.
 */

import {
  createMemoryBackend,
  WIDGET_FONT_KEY,
  WIDGET_PATTERN_KEY,
} from '../../blocking/appGroupStore';
import {
  DEFAULT_WIDGET_PREFERENCES,
  readWidgetPreferences,
  writeWidgetPreferences,
} from '../preferences';

describe('widget preferences', () => {
  it('falls back to defaults on an empty App Group', () => {
    const backend = createMemoryBackend();
    expect(readWidgetPreferences(backend)).toEqual(DEFAULT_WIDGET_PREFERENCES);
    expect(DEFAULT_WIDGET_PREFERENCES).toEqual({
      pattern: 'solid',
      showsPercent: true,
      font: 'rounded',
    });
  });

  it('roundtrips a patch through the App Group keys', () => {
    const backend = createMemoryBackend();

    const next = writeWidgetPreferences(backend, {
      pattern: 'stripes',
      showsPercent: false,
      font: 'mono',
    });
    expect(next).toEqual({ pattern: 'stripes', showsPercent: false, font: 'mono' });
    expect(readWidgetPreferences(backend)).toEqual(next);

    // The Swift widget reads the individual keys, not a composite blob.
    expect(backend.get(WIDGET_PATTERN_KEY)).toBe('stripes');
    expect(backend.get(WIDGET_FONT_KEY)).toBe('mono');
  });

  it('patches only the provided fields', () => {
    const backend = createMemoryBackend();
    writeWidgetPreferences(backend, { pattern: 'dots' });

    expect(readWidgetPreferences(backend)).toEqual({
      pattern: 'dots',
      showsPercent: DEFAULT_WIDGET_PREFERENCES.showsPercent,
      font: DEFAULT_WIDGET_PREFERENCES.font,
    });

    writeWidgetPreferences(backend, { showsPercent: false });
    expect(readWidgetPreferences(backend).pattern).toBe('dots');
    expect(readWidgetPreferences(backend).showsPercent).toBe(false);
  });

  it('rejects unknown stored values back to defaults', () => {
    const backend = createMemoryBackend();
    backend.set(WIDGET_PATTERN_KEY, 'polka');
    backend.set(WIDGET_FONT_KEY, 42);

    const prefs = readWidgetPreferences(backend);
    expect(prefs.pattern).toBe(DEFAULT_WIDGET_PREFERENCES.pattern);
    expect(prefs.font).toBe(DEFAULT_WIDGET_PREFERENCES.font);
  });

  it('rejects unknown patch values back to defaults', () => {
    const backend = createMemoryBackend();
    const next = writeWidgetPreferences(backend, {
      pattern: 'rainbow' as never,
      font: 'comic-sans' as never,
    });
    expect(next.pattern).toBe(DEFAULT_WIDGET_PREFERENCES.pattern);
    expect(next.font).toBe(DEFAULT_WIDGET_PREFERENCES.font);
  });
});
