import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type {ReactNode} from 'react';
import {useColorScheme} from 'react-native';
import {motion, radius, spacing, typography} from './tokens';

export type ThemeName = 'light' | 'dark';

/**
 * Semantic colors resolved per theme. Both themes are soft neutrals, never
 * pure black/white: light is a grouped iOS-style gray canvas with white cards,
 * dark is a warm charcoal (#131316) — full black reads harsh and hides the
 * rounded card edges. Accent stays monochrome: ink in light, near-white in
 * dark, so "the darker it gets, the stricter it feels" still holds.
 */
export interface ThemeColors {
  /** Screen background. */
  bg: string;
  /** Grouped/quiet surface (cards, bars). */
  surface: string;
  /** Raised surface sitting on bg (cards, sheets). */
  raised: string;
  /** Primary text and highest-contrast fills. */
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  borderStrong: string;
  /** Interactive accent: ink in light theme, paper in dark. */
  accent: string;
  /** Content drawn on top of accent. */
  onAccent: string;
  /** Unfilled tracks (progress, timeline idle). */
  track: string;
  /** Modal scrim. */
  scrim: string;
  /** Strong theme tint for Liquid Glass — keeps blobs readable in both themes. */
  glassTint: string;
  /** Destructive/error content (failed saves, destructive confirmations). */
  danger: string;
}

export const lightColors: ThemeColors = {
  bg: '#F4F4F6',
  surface: '#EBEBEF',
  raised: '#FFFFFF',
  text: '#111114',
  textMuted: '#6C6C72',
  textFaint: '#9A9AA1',
  border: 'rgba(60, 60, 67, 0.14)',
  borderStrong: 'rgba(60, 60, 67, 0.28)',
  accent: '#111114',
  onAccent: '#FFFFFF',
  track: '#E2E2E7',
  scrim: 'rgba(10, 10, 10, 0.4)',
  glassTint: 'rgba(255, 255, 255, 0.75)',
  danger: '#B3402F',
};

export const darkColors: ThemeColors = {
  bg: '#131316',
  surface: '#26262C',
  raised: '#1D1D21',
  text: '#F4F4F6',
  textMuted: 'rgba(244, 244, 246, 0.66)',
  textFaint: 'rgba(244, 244, 246, 0.42)',
  border: 'rgba(255, 255, 255, 0.12)',
  borderStrong: 'rgba(255, 255, 255, 0.26)',
  accent: '#F4F4F6',
  onAccent: '#131316',
  track: 'rgba(255, 255, 255, 0.18)',
  scrim: 'rgba(0, 0, 0, 0.55)',
  glassTint: 'rgba(20, 20, 24, 0.75)',
  danger: '#FF7A6B',
};

export interface Theme {
  name: ThemeName;
  colors: ThemeColors;
  typography: typeof typography;
  spacing: typeof spacing;
  radius: typeof radius;
  motion: typeof motion;
  setTheme: (name: ThemeName) => void;
  toggle: () => void;
}

export type ThemePreference = ThemeName | 'system';

const ThemeContext = createContext<Theme | null>(null);

function palette(name: ThemeName): ThemeColors {
  return name === 'dark' ? darkColors : lightColors;
}

/** Standalone fallback so components render without a provider (tests, previews). */
const fallbackTheme: Theme = {
  name: 'light',
  colors: lightColors,
  typography,
  spacing,
  radius,
  motion,
  setTheme: () => undefined,
  toggle: () => undefined,
};

export interface ThemeProviderProps {
  children: ReactNode;
  /** 'system' follows the OS color scheme (default). */
  initial?: ThemePreference;
}

export function ThemeProvider({children, initial = 'system'}: ThemeProviderProps) {
  const scheme = useColorScheme();
  const [explicit, setExplicit] = useState<ThemeName | null>(null);

  const name: ThemeName =
    explicit ?? (initial === 'system' ? (scheme === 'dark' ? 'dark' : 'light') : initial);

  const setTheme = useCallback((next: ThemeName) => setExplicit(next), []);
  const toggle = useCallback(
    () => setExplicit(name === 'dark' ? 'light' : 'dark'),
    [name],
  );

  const value = useMemo<Theme>(
    () => ({
      name,
      colors: palette(name),
      typography,
      spacing,
      radius,
      motion,
      setTheme,
      toggle,
    }),
    [name, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the active theme. Falls back to the light theme outside a provider. */
export function useTheme(): Theme {
  return useContext(ThemeContext) ?? fallbackTheme;
}
