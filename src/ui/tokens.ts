/**
 * Veto design tokens — the single source of truth for the monochrome brand.
 * Rule of the brand: "the darker it gets, the stricter it feels".
 *
 * Pure data only (no React Native imports) so it is safe to use anywhere:
 * components, Reanimated worklets, jest snapshots, e2e assertions.
 */

/** Core monochrome palette. */
export const colors = {
  /** #0A0A0A — darkest ink, the "strictest" color. */
  ink: '#0A0A0A',
  /** #FFFFFF — paper. */
  paper: '#FFFFFF',
  gray100: '#F5F5F5',
  gray200: '#E5E5E5',
  gray300: '#D4D4D4',
  gray400: '#A3A3A3',
  gray500: '#737373',
  gray600: '#525252',
  gray700: '#404040',
  gray800: '#262626',
  gray900: '#171717',
} as const;

export type ColorToken = keyof typeof colors;

/**
 * Typography. SF Pro is the iOS system font, so font family is "System";
 * weight/size carry the brand. Display sizes: Home clock = 64pt, shield
 * countdown = 80pt (fixed brand decision).
 */
export const fontFamily = 'System' as const;

export interface TypeStyle {
  fontFamily: typeof fontFamily;
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '600' | '700' | '800';
  letterSpacing: number;
}

export const typography = {
  /** Shield screen countdown. */
  hero: {fontFamily, fontSize: 80, lineHeight: 84, fontWeight: '800', letterSpacing: -2},
  /** Home screen clock. */
  display: {fontFamily, fontSize: 64, lineHeight: 68, fontWeight: '700', letterSpacing: -1.5},
  title1: {fontFamily, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5},
  title2: {fontFamily, fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.3},
  title3: {fontFamily, fontSize: 17, lineHeight: 24, fontWeight: '600', letterSpacing: 0},
  body: {fontFamily, fontSize: 17, lineHeight: 24, fontWeight: '400', letterSpacing: 0},
  callout: {fontFamily, fontSize: 15, lineHeight: 20, fontWeight: '400', letterSpacing: 0},
  caption: {fontFamily, fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: 0},
  /** Overlines / uppercase labels. */
  micro: {fontFamily, fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.8},
} satisfies Record<string, TypeStyle>;

export type TypeToken = keyof typeof typography;

/** 4pt grid. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
  giant: 64,
} as const;

export type SpacingToken = keyof typeof spacing;

/** Any multiple of the 4pt grid. */
export const space = (steps: number): number => Math.round(steps) * 4;

/** Corner radii: cards 16, controls 12, pills/circles full. */
export const radius = {
  card: 16,
  control: 12,
  full: 999,
} as const;

export type RadiusToken = keyof typeof radius;

/**
 * Motion presets: 250–350ms ease-out, used ONLY on transitions
 * (sheets, screen changes) — never on per-frame feedback loops.
 * `bezier` holds CSS-style control points for Reanimated's Easing.bezier;
 * `duration` is in milliseconds for Animated.timing / withTiming.
 */
export const motion = {
  duration: {
    fast: 250,
    base: 300,
    slow: 350,
  },
  easing: 'ease-out' as const,
  bezier: [0.33, 1, 0.68, 1] as [number, number, number, number],
};

export type MotionPreset = keyof typeof motion.duration;
