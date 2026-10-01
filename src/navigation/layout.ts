import { useWindowDimensions } from 'react-native';

import { useCoachPanelState } from './coachPanelStore';

// At this window width and up, the app switches from the phone layout (bottom tabs)
// to the desktop one (sidebar, content, coach panel).
export const DESKTOP_MIN_WIDTH = 1024;
export const SIDEBAR_WIDTH = 248;
export const COACH_PANEL_WIDTH = 360;
export const COACH_PANEL_COLLAPSED_WIDTH = 56;
// Side sheets (the calendar's event editor) slide in over the coach panel.
export const RIGHT_SHEET_WIDTH = 400;

// Below this width the coach panel defaults to collapsed (it leaves too little room
// for the main column otherwise); at or above it, it defaults open. Only the default —
// once the user has clicked the collapse or reopen button, their choice sticks
// regardless of window width (see coachPanelStore.ts).
export const COACH_PANEL_COLLAPSE_BREAKPOINT = 1280;

export function useIsDesktop(): boolean {
  return useWindowDimensions().width >= DESKTOP_MIN_WIDTH;
}

// The coach panel's actual collapsed state right now: the user's saved choice if
// they've made one, otherwise the width-based default.
export function useCoachPanelCollapsed(): boolean {
  const { width } = useWindowDimensions();
  const { state } = useCoachPanelState();
  return state.collapsed ?? width < COACH_PANEL_COLLAPSE_BREAKPOINT;
}
