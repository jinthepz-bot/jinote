import { createPersistedStore } from '../storage/persistedStore';

// Just a name, for the desktop Today greeting. Not used anywhere else yet.
export interface ProfileState {
  name: string;
}

const KEY = 'jinesist.profile.v1';
const DEFAULT_NAME = 'Jin';

function normalize(raw: unknown): ProfileState {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return { name: typeof obj.name === 'string' ? obj.name : DEFAULT_NAME };
}

const store = createPersistedStore<ProfileState>({
  key: KEY,
  initial: { name: DEFAULT_NAME },
  normalize,
  label: 'profile',
});

export const useProfile = () => store.useStore();
export const getProfileState = store.get;

// Replaces the name from a backup file, through the same validation as a load.
export function importProfile(raw: unknown) {
  store.set(normalize(raw));
}

// An empty name is valid — it's how the greeting drops "Jin" and just says "Good morning."
export function setUserName(name: string) {
  store.set({ name });
}
