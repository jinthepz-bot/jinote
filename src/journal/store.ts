import { isDayKey } from '../coach/days';
import { createPersistedStore } from '../storage/persistedStore';

// The Daily journal: at most one entry per day — a mood and three short answers.
// A day with nothing written has no entry at all, so the mood grid can tell an
// empty day from one that was filled in.

export type Mood = 1 | 2 | 3 | 4 | 5;

export interface DailyEntry {
  date: string; // local day, "YYYY-MM-DD"
  mood: Mood | null;
  wentWell: string;
  gotInTheWay: string;
  tomorrowFocus: string;
  updatedAt: number;
}

export interface DailyState {
  entries: Record<string, DailyEntry>; // keyed by date
}

export type DailyFields = Pick<DailyEntry, 'mood' | 'wentWell' | 'gotInTheWay' | 'tomorrowFocus'>;

const KEY = 'jinesist.daily.v1';

const isMood = (v: unknown): v is Mood => v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

const isBlank = (e: DailyFields) =>
  e.mood === null && !e.wentWell.trim() && !e.gotInTheWay.trim() && !e.tomorrowFocus.trim();

function normalize(raw: unknown): DailyState {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const rawEntries = (typeof obj.entries === 'object' && obj.entries !== null ? obj.entries : {}) as Record<string, unknown>;
  const entries: Record<string, DailyEntry> = {};
  for (const [date, value] of Object.entries(rawEntries)) {
    if (!isDayKey(date) || typeof value !== 'object' || value === null) continue;
    const e = value as Record<string, unknown>;
    const entry: DailyEntry = {
      date,
      mood: isMood(e.mood) ? e.mood : null,
      wentWell: str(e.wentWell),
      gotInTheWay: str(e.gotInTheWay),
      tomorrowFocus: str(e.tomorrowFocus),
      updatedAt: typeof e.updatedAt === 'number' && Number.isFinite(e.updatedAt) ? e.updatedAt : 0,
    };
    if (!isBlank(entry)) entries[date] = entry;
  }
  return { entries };
}

const store = createPersistedStore<DailyState>({
  key: KEY,
  initial: { entries: {} },
  normalize,
  label: 'daily journal',
});

export const useDaily = () => store.useStore();
export const getDailyState = store.get;

// From a backup file, through the same validation as a load.
export function importDaily(raw: unknown) {
  store.set(normalize(raw));
}

export function resetDaily() {
  store.set({ entries: {} });
}

// Merges `patch` into that day's entry. Clearing everything removes the entry, so
// the day goes back to being an empty one.
export function saveDailyEntry(date: string, patch: Partial<DailyFields>) {
  store.update((state) => {
    const current: DailyFields = state.entries[date] ?? { mood: null, wentWell: '', gotInTheWay: '', tomorrowFocus: '' };
    const next: DailyFields = { ...current, ...patch };
    const entries = { ...state.entries };
    if (isBlank(next)) delete entries[date];
    else
      entries[date] = {
        date,
        mood: next.mood,
        wentWell: next.wentWell,
        gotInTheWay: next.gotInTheWay,
        tomorrowFocus: next.tomorrowFocus,
        updatedAt: Date.now(),
      };
    return { entries };
  });
}

// Entries from `from` to `to` (inclusive), oldest first.
export function dailyEntriesBetween(state: DailyState, from: string, to: string): DailyEntry[] {
  return Object.values(state.entries)
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
}
