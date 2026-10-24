/**
 * Home-screen widget appearance ("Time left today" — targets/DayLeftWidget).
 *
 * Preferences live in the App Group so the Swift widget re-reads them on
 * every timeline build; this module is the TS side of that contract and the
 * only place that knows the values (key names live in blocking/appGroupStore,
 * mirrored by DayLeftWidget.swift). Reads degrade to defaults in Expo Go,
 * where the App Group suite cannot exist.
 *
 * Live seconds are NOT a preference: the gallery ships two separate widgets
 * ("Time left today" / "Time left · live seconds"), so the choice belongs to
 * the widget the user places, not to a settings toggle.
 */

import {
  WIDGET_FONT_KEY,
  WIDGET_PATTERN_KEY,
  WIDGET_SHOW_PERCENT_KEY,
  type VetoStoreBackend,
} from '../blocking/appGroupStore';

export const WIDGET_PATTERNS = ['solid', 'stripes', 'dots'] as const;
export type WidgetPattern = (typeof WIDGET_PATTERNS)[number];

export const WIDGET_FONTS = ['system', 'rounded', 'mono'] as const;
export type WidgetFont = (typeof WIDGET_FONTS)[number];

export interface WidgetPreferences {
  pattern: WidgetPattern;
  showsPercent: boolean;
  font: WidgetFont;
}

export const DEFAULT_WIDGET_PREFERENCES: WidgetPreferences = {
  pattern: 'solid',
  showsPercent: true,
  font: 'rounded',
};

function storedPattern(value: unknown): WidgetPattern {
  return WIDGET_PATTERNS.includes(value as WidgetPattern)
    ? (value as WidgetPattern)
    : DEFAULT_WIDGET_PREFERENCES.pattern;
}

function storedFont(value: unknown): WidgetFont {
  return WIDGET_FONTS.includes(value as WidgetFont)
    ? (value as WidgetFont)
    : DEFAULT_WIDGET_PREFERENCES.font;
}

/** Current widget appearance; unknown/missing values fall back to defaults. */
export function readWidgetPreferences(backend: VetoStoreBackend): WidgetPreferences {
  return {
    pattern: storedPattern(backend.get<WidgetPattern>(WIDGET_PATTERN_KEY)),
    showsPercent:
      typeof backend.get<boolean>(WIDGET_SHOW_PERCENT_KEY) === 'boolean'
        ? (backend.get<boolean>(WIDGET_SHOW_PERCENT_KEY) as boolean)
        : DEFAULT_WIDGET_PREFERENCES.showsPercent,
    font: storedFont(backend.get<WidgetFont>(WIDGET_FONT_KEY)),
  };
}

/** Writes the patch into the App Group (values validated before storing). */
export function writeWidgetPreferences(
  backend: VetoStoreBackend,
  patch: Partial<WidgetPreferences>,
): WidgetPreferences {
  const current = readWidgetPreferences(backend);
  const next: WidgetPreferences = {
    pattern: patch.pattern !== undefined ? storedPattern(patch.pattern) : current.pattern,
    showsPercent:
      patch.showsPercent !== undefined ? patch.showsPercent : current.showsPercent,
    font: patch.font !== undefined ? storedFont(patch.font) : current.font,
  };
  backend.set(WIDGET_PATTERN_KEY, next.pattern);
  backend.set(WIDGET_SHOW_PERCENT_KEY, next.showsPercent);
  backend.set(WIDGET_FONT_KEY, next.font);
  return next;
}
