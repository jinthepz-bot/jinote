import { useWindowDimensions } from 'react-native';

// At this window width and up, the app switches from the phone layout (bottom tabs)
// to the desktop one (sidebar, content, always-visible coach panel).
export const DESKTOP_MIN_WIDTH = 1024;
export const SIDEBAR_WIDTH = 248;
export const COACH_PANEL_WIDTH = 360;

export function useIsDesktop(): boolean {
  return useWindowDimensions().width >= DESKTOP_MIN_WIDTH;
}
