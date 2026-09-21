// Dark, warm theme for the coach screens.
//
// Everything except the accent is fixed. The accent is user-chosen (Settings →
// Appearance), so it is NOT in `colors` — components read it from `useAccent()`
// (see design/accent.tsx) and apply it as an inline style. Static stylesheets are
// built once at module load, so a baked-in accent could never change at runtime.

export interface Palette {
  isDark: boolean;
  background: string;
  sidebar: string; // desktop sidebar
  surface: string; // cards
  surface2: string; // raised or recessed areas inside a card
  border: string;
  divider: string; // hairlines inside a card or list
  text: string;
  textMuted: string;
  accentStrong: string; // warnings, overdue — semantic, never themed
  success: string;
  eventBlue: string;
  goalGreen: string;
  deadlineRed: string;
  darkCard: string; // the one dark card on a light theme
  accentStrongSoft: string;
  successSoft: string;
}

const cream: Palette = {
  isDark: false,
  background: '#F4EEE2',
  sidebar: '#EDE5D5',
  surface: '#FFFBF3',
  surface2: '#EDE5D5',
  border: '#E3D9C6',
  divider: '#EFE7D8',
  text: '#2A2620',
  textMuted: '#6A6153',
  accentStrong: '#A8322B',
  success: '#3E6B3A',
  eventBlue: '#2D5A7B',
  goalGreen: '#3E6B3A',
  deadlineRed: '#A8322B',
  darkCard: '#2A2620',
  accentStrongSoft: 'rgba(168, 50, 43, 0.12)',
  successSoft: 'rgba(62, 107, 58, 0.14)',
};

const dark: Palette = {
  isDark: true,
  background: '#1c1a17',
  sidebar: '#211e1b',
  surface: '#262320',
  surface2: '#302c27',
  border: '#423c34',
  divider: '#35302a',
  text: '#f2ede4',
  textMuted: '#a89e8f',
  accentStrong: '#b0472f',
  success: '#7f9d6f',
  eventBlue: '#6f9bc0',
  goalGreen: '#7f9d6f',
  deadlineRed: '#b0472f',
  darkCard: '#302c27',
  accentStrongSoft: 'rgba(176, 71, 47, 0.18)',
  successSoft: 'rgba(127, 157, 111, 0.16)',
};

export const themes = { cream, dark };
export type ThemeName = keyof typeof themes;

// Stylesheets across the app are built once at module load and read `colors` then,
// so the theme is chosen here, at load time, not switched while running. Change
// this one line (and reload) to try the other palette.
export const THEME: ThemeName = 'cream';

export const colors: Palette = themes[THEME];

// For TextInput's `keyboardAppearance` (iOS).
export const keyboardAppearance = colors.isDark ? 'dark' : 'light';

export const radius = {
  card: 10,
  control: 8,
  chip: 8,
  square: 4, // small squares: checkboxes, heatmap cells, legend swatches
};

// The one spacing scale. Every gap, padding and margin should come from here;
// anything in between is a rounding error someone else will copy.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

// Fixed control sizes, so a button, an input and an icon button all line up.
export const sizes = {
  control: 44, // buttons and single-line inputs — also the minimum touch target
  controlSm: 36, // secondary buttons, icon buttons, chips
  action: 48, // full-width dashed "+ New ..." actions
  checkbox: 22,
  rowIcon: 18, // inline icons in list rows (delete, edit)
};

// --- accent

export interface Accent {
  id: string;
  name: string;
  hex: string;
}

// A small curated set rather than a full picker: each is saturated enough to read
// against `background`. Terracotta is the Cream theme's own accent.
export const ACCENTS: Accent[] = [
  { id: 'terracotta', name: 'Terracotta', hex: '#B4502A' },
  { id: 'amber', name: 'Amber', hex: '#c98a3b' },
  { id: 'rust', name: 'Rust', hex: '#cf6b45' },
  { id: 'sage', name: 'Sage', hex: '#7f9d6f' },
  { id: 'teal', name: 'Teal', hex: '#4c9d95' },
  { id: 'sky', name: 'Sky', hex: '#5a8fd0' },
  { id: 'orchid', name: 'Orchid', hex: '#a077cc' },
];

export const DEFAULT_ACCENT_ID = 'terracotta';

export function accentById(id: string): Accent {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
}

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgba = (hex: string, alpha: number) => {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// WCAG relative luminance and contrast, used only to decide whether text sitting
// *on* the accent should be the dark background or the light body colour. Comparing
// the two actual contrast ratios beats a luminance threshold, which is easy to set
// slightly wrong and silently returns the less readable of the two.
function luminance(hex: string): number {
  const srgb = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// Whichever of the two theme text colours reads better on this accent.
function readableOn(hex: string): string {
  return contrast(hex, colors.background) >= contrast(hex, colors.text) ? colors.background : colors.text;
}

export interface AccentPalette {
  id: string;
  name: string;
  accent: string;
  accentSoft: string; // low-opacity tint: badges, highlighted backgrounds
  onAccent: string; // text and icons placed on top of the accent
  scale: string[]; // rising strengths for the activity heatmap (level 1..4)
}

export function makeAccentPalette(id: string): AccentPalette {
  const accent = accentById(id);
  const { hex, name } = accent;
  return {
    id: accent.id, // the resolved id, so an unknown one can't leak back out
    name,
    accent: hex,
    accentSoft: rgba(hex, 0.14),
    onAccent: readableOn(hex),
    scale: [rgba(hex, 0.26), rgba(hex, 0.48), rgba(hex, 0.74), hex],
  };
}

// Font family names as registered by expo-font (see src/design/fonts.tsx).
export const fontFamilies = {
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_600SemiBold',
};
