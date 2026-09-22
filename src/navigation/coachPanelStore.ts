import { createPersistedStore } from '../storage/persistedStore';

// Whether the desktop coach panel is collapsed. `null` means the user has never
// toggled it, so the width-based default in layout.ts applies; once they click the
// collapse or reopen button, their choice is remembered here regardless of width.
export interface CoachPanelState {
  collapsed: boolean | null;
}

const KEY = 'jinesist.coachPanel.v1';

function normalize(raw: unknown): CoachPanelState {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return { collapsed: typeof obj.collapsed === 'boolean' ? obj.collapsed : null };
}

const store = createPersistedStore<CoachPanelState>({
  key: KEY,
  initial: { collapsed: null },
  normalize,
  label: 'coach panel',
});

export const useCoachPanelState = () => store.useStore();

export function setCoachPanelCollapsed(collapsed: boolean) {
  store.set({ collapsed });
}
