import { useWindowDimensions } from 'react-native';

import { useCoachPanelState } from './coachPanelStore';

// Three layouts by window width:
// - phone (below COMPACT_DESKTOP_MIN_WIDTH): bottom tabs;
// - compact desktop (COMPACT_DESKTOP_MIN_WIDTH up to DESKTOP_MIN_WIDTH, e.g. a
//   half-width Mac window): the desktop screens, with the sidebar shrunk to an icon
//   rail and the coach panel as a strip that opens over the main area;
// - desktop (DESKTOP_MIN_WIDTH and up): sidebar, content, coach panel side by side.
export const COMPACT_DESKTOP_MIN_WIDTH = 720;
export const DESKTOP_MIN_WIDTH = 1024;
export const SIDEBAR_WIDTH = 248;
export const SIDEBAR_RAIL_WIDTH = 64;
export const COACH_PANEL_WIDTH = 360;
export const COACH_PANEL_COLLAPSED_WIDTH = 56;
// Side sheets (the calendar's event editor) slide in over the coach panel.
export const RIGHT_SHEET_WIDTH = 400;

// Below this width the coach panel defaults to collapsed (it leaves too little room
// for the main column otherwise); at or above it, it defaults open. Only the default —
// once the user has clicked the collapse or reopen button, their choice sticks
// regardless of window width (see coachPanelStore.ts).
export const COACH_PANEL_COLLAPSE_BREAKPOINT = 1280;

export type LayoutMode = 'phone' | 'compact' | 'desktop';

export function layoutModeFor(width: number): LayoutMode {
  if (width >= DESKTOP_MIN_WIDTH) return 'desktop';
  return width >= COMPACT_DESKTOP_MIN_WIDTH ? 'compact' : 'phone';
}

export function useLayoutMode(): LayoutMode {
  return layoutModeFor(useWindowDimensions().width);
}

// True for both desktop layouts: everything that picks the desktop design over the
// phone one asks this.
export function useIsDesktop(): boolean {
  return useLayoutMode() !== 'phone';
}

export function useIsCompactDesktop(): boolean {
  return useLayoutMode() === 'compact';
}

// Whether the coach column beside the main area is just the narrow strip. In the
// compact layout it always is (opening the coach there overlays the main area
// instead of taking a column); otherwise it's the user's saved choice if they've
// made one, else the width-based default.
export function useCoachPanelCollapsed(): boolean {
  const { width } = useWindowDimensions();
  const { state } = useCoachPanelState();
  if (layoutModeFor(width) === 'compact') return true;
  return state.collapsed ?? width < COACH_PANEL_COLLAPSE_BREAKPOINT;
}

// The width of the main column between the sidebar (or rail) and the coach column.
export function useMainWidth(): number {
  const { width } = useWindowDimensions();
  const collapsed = useCoachPanelCollapsed();
  const mode = layoutModeFor(width);
  if (mode === 'phone') return width;
  const sidebar = mode === 'compact' ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH;
  return width - sidebar - (collapsed ? COACH_PANEL_COLLAPSED_WIDTH : COACH_PANEL_WIDTH);
}
