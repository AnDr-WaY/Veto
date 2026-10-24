import React from 'react';
import {SymbolView} from 'expo-symbols';
import type {SymbolViewProps} from 'expo-symbols';
import {useTheme} from '../Theme';

/** Type-safe SF Symbol name (the union comes from expo-symbols). */
export type IconName = Extract<SymbolViewProps['name'], string>;

export interface IconProps {
  name: IconName;
  /** Point size (default 24). */
  size?: number;
  /** SF Symbols weight — the brand stroke is 'semibold'. */
  weight?: Extract<SymbolViewProps['weight'], string>;
  /** Defaults to the theme text color. */
  color?: string;
}

/**
 * SF Symbols rendered monochrome with the theme applied — the one true icon.
 * Crisp at any size, matches the system look; falls back to nothing on
 * platforms without the symbol (irrelevant for this iOS-only app).
 */
export function Icon({name, size = 24, weight = 'semibold', color}: IconProps) {
  const {colors} = useTheme();
  return (
    <SymbolView
      name={name}
      size={size}
      weight={weight}
      type="monochrome"
      tintColor={color ?? colors.text}
    />
  );
}
