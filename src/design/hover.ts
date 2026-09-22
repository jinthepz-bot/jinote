import { StyleSheet, type PressableStateCallbackType } from 'react-native';

import { colors, rgba } from './theme';

// Shared pointer feedback for every Pressable in the app.
//
// On web, react-native-web hands the style callback a `hovered` flag alongside
// `pressed`; React Native's own types only know about `pressed`, so the helpers here
// read it through one cast instead of every call site doing the same thing. On a
// phone there is no hover, so these quietly reduce to the pressed state.

interface PointerState {
  pressed: boolean;
  hovered?: boolean;
}

const read = (state: PressableStateCallbackType): PointerState => state as PointerState;

export const hoverStyles = StyleSheet.create({
  // A pointer cursor is the main "this does something" signal on the web.
  pointer: { cursor: 'pointer' },
  // For controls drawn on the page background or a card: darken the surface.
  hovered: { backgroundColor: rgba(colors.text, 0.06) },
  pressed: { backgroundColor: rgba(colors.text, 0.12) },
  // For controls that already carry their own fill (accent buttons, chips, blocks),
  // where changing the background would fight the colour they're meant to show.
  hoveredDim: { opacity: 0.86 },
  pressedDim: { opacity: 0.7 },
  // A block lifting slightly off the grid.
  raised: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});

// Darkening background: menu rows, sidebar links, day cells, icon buttons.
export function hoverFill(state: PressableStateCallbackType) {
  const { hovered, pressed } = read(state);
  return [hoverStyles.pointer, hovered && hoverStyles.hovered, pressed && hoverStyles.pressed];
}

// Fading: anything that already has its own fill.
export function hoverDim(state: PressableStateCallbackType) {
  const { hovered, pressed } = read(state);
  return [hoverStyles.pointer, hovered && hoverStyles.hoveredDim, pressed && hoverStyles.pressedDim];
}

// For callers that need the flags themselves (a calendar block swaps its tint and
// lifts, rather than just dimming).
export const pointerState = read;
