import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { createPersistedStore } from '../storage/persistedStore';
import { DEFAULT_ACCENT_ID, accentById, makeAccentPalette, type AccentPalette } from './theme';

interface ThemeState {
  accentId: string;
}

const KEY = 'jinesist.theme.v1';

function normalize(raw: unknown): ThemeState {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const id = typeof obj.accentId === 'string' ? obj.accentId : DEFAULT_ACCENT_ID;
  return { accentId: accentById(id).id }; // falls back to the default if the id is unknown
}

const store = createPersistedStore<ThemeState>({
  key: KEY,
  initial: { accentId: DEFAULT_ACCENT_ID },
  normalize,
  label: 'theme',
});

export const themeReady = store.ready;
export const getThemeState = store.get;
export const setAccentId = (accentId: string) => store.set({ accentId: accentById(accentId).id });
export function importTheme(raw: unknown) {
  store.set(normalize(raw));
}

interface AccentContext {
  palette: AccentPalette; // the preview while one is open, otherwise the saved choice
  savedId: string;
  previewId: string | null;
  preview: (id: string) => void;
  commit: () => void;
  cancel: () => void;
}

const Context = createContext<AccentContext | null>(null);

// Wraps the app so a change to the accent re-renders everything that draws with it.
// A preview is held in memory only: it themes the whole app live, and is either
// saved or dropped — closing the app mid-preview leaves the saved choice intact.
export function AccentProvider({ children }: { children: ReactNode }) {
  const { state } = store.useStore();
  const [previewId, setPreviewId] = useState<string | null>(null);

  const value = useMemo<AccentContext>(() => {
    const activeId = previewId ?? state.accentId;
    return {
      palette: makeAccentPalette(activeId),
      savedId: state.accentId,
      previewId,
      preview: setPreviewId,
      commit: () => {
        if (previewId) setAccentId(previewId);
        setPreviewId(null);
      },
      cancel: () => setPreviewId(null),
    };
  }, [previewId, state.accentId]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

// The accent colours to draw with right now. Safe outside the provider (tests,
// isolated previews): it falls back to the default palette.
export function useAccent(): AccentPalette {
  return useContext(Context)?.palette ?? makeAccentPalette(DEFAULT_ACCENT_ID);
}

// Only the Appearance settings need the preview controls.
export function useAccentChooser(): AccentContext {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useAccentChooser must be used inside AccentProvider');
  return ctx;
}
