// What cloud sync covers, and how each store's state maps to rows: one row per item
// (a goal, a set, a note, a Daily journal day…) in supabase/schema.sql's sync_items,
// keyed by (collection, item id). Settings are one row per settings store.
//
// Stays on each device: the calendar's view and zoom, and whether the coach panel is
// open. Recipe photos travel separately, as files (see sync/photos.ts).
import { withRecomputedGoals, type CoachState, type Goal } from '../coach/store';
import { chatStore } from '../storage';
import type { AppMessage } from '../types';

// Imported for their side effect too: each store registers itself (see
// storage/persistedStore.ts) when its module loads.
import '../coach/store';
import '../design/accent';
import '../journal/store';
import '../notes/store';
import '../notifications/store';
import '../profile/store';
import '../schedule/store';

export type Collection =
  | 'goals'
  | 'entries'
  | 'tasks'
  | 'toBuy'
  | 'events'
  | 'notes'
  | 'folders'
  | 'daily'
  | 'chat'
  | 'settings';

// Only this many of the newest chat messages go to the cloud.
export const CHAT_SYNC_LIMIT = 200;

type Item = Record<string, unknown>;
type State = unknown;

export interface Part {
  collection: Collection;
  // The items of this part, by id.
  read: (state: State) => Map<string, Item>;
  // The state with this part's items replaced by `items`.
  write: (state: State, items: Map<string, Item>) => State;
  // For data from before sync existed: the best guess at when an item last changed.
  // Where the same item differs on two devices, the newer guess wins — and on a tie,
  // the copy already in the cloud.
  legacyTime: (item: Item) => number;
  // Settings only: the one item id this part holds.
  onlyId?: string;
}

export interface Source {
  storeKey: string;
  parts: Part[];
  // Runs on the merged state before the store's own clean-up (normalize).
  // `applied` holds "collection:id" for each item that just arrived.
  prepare?: (state: State, applied: Set<string>, editedAt: (collection: Collection, id: string) => number) => State;
  // Runs after it. Whatever this changes counts as an edit on this device, so it
  // goes back up (records recomputed from merged sets, say).
  fixup?: (state: State) => State;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// An array of { id } inside the state, at `field`. Items keep their order here; new
// ones go at the end, or into place by `sortBy` when it's given.
function arrayPart(
  collection: Collection,
  field: string,
  legacyTime: (item: Item) => number,
  sortBy?: (item: Item) => number,
): Part {
  return {
    collection,
    legacyTime,
    read: (state) => {
      const list = ((state as Record<string, unknown>)[field] ?? []) as Item[];
      return new Map(list.map((item) => [String(item.id), item]));
    },
    write: (state, items) => {
      const list = ((state as Record<string, unknown>)[field] ?? []) as Item[];
      const seen = new Set<string>();
      const next: Item[] = [];
      for (const item of list) {
        const id = String(item.id);
        const replacement = items.get(id);
        if (replacement) {
          next.push(replacement);
          seen.add(id);
        }
      }
      for (const [id, item] of items) if (!seen.has(id)) next.push(item);
      if (sortBy) next.sort((a, b) => sortBy(a) - sortBy(b));
      return { ...(state as object), [field]: next };
    },
  };
}

// A whole settings store as one row.
function settingsPart(id: string): Part {
  return {
    collection: 'settings',
    onlyId: id,
    legacyTime: () => 0,
    read: (state) => new Map([[id, state as Item]]),
    write: (state, items) => items.get(id) ?? state,
  };
}

export const SOURCES: Source[] = [
  {
    storeKey: 'jinesist.coach.v2',
    parts: [
      arrayPart('goals', 'goals', (g) => num(g.createdAt)),
      arrayPart('entries', 'entries', (e) => num(e.loggedAt)),
      arrayPart('tasks', 'tasks', (t) => Math.max(num(t.createdAt), num(t.completedAt))),
      arrayPart('toBuy', 'toBuy', (b) => num(b.createdAt)),
    ],
    // One featured goal: if one that just arrived is featured, it's the newest choice,
    // so the others step down (the store's clean-up would otherwise keep whichever
    // came first).
    prepare: (raw, applied, editedAt) => {
      const state = raw as CoachState;
      const arrived = state.goals.filter((g) => g.featured && applied.has(`goals:${g.id}`));
      if (arrived.length === 0) return state;
      const winner = arrived.reduce((a, b) => (editedAt('goals', b.id) > editedAt('goals', a.id) ? b : a));
      return { ...state, goals: state.goals.map((g): Goal => ({ ...g, featured: g.id === winner.id })) };
    },
    fixup: (state) => withRecomputedGoals(state as CoachState),
  },
  {
    storeKey: 'jinesist.schedule.v1',
    parts: [arrayPart('events', 'events', (e) => num(e.createdAt))],
  },
  {
    // Checklists, recipes, tags, pins and covers are all part of a note's row.
    storeKey: 'jinesist.notes.v1',
    parts: [
      arrayPart('notes', 'notes', (n) => Math.max(num(n.updatedAt), num(n.createdAt), num(n.pinnedAt))),
      arrayPart('folders', 'folders', (f) => num(f.createdAt)),
    ],
  },
  {
    storeKey: 'jinesist.daily.v1',
    parts: [
      {
        collection: 'daily',
        legacyTime: (d) => num(d.updatedAt),
        read: (state) => new Map(Object.entries((state as { entries: Record<string, Item> }).entries)),
        write: (state, items) => ({ ...(state as object), entries: Object.fromEntries(items) }),
      },
    ],
  },
  {
    storeKey: chatStore.key,
    parts: [
      {
        collection: 'chat',
        legacyTime: (m) => num(m.createdAt),
        read: (state) => new Map((state as AppMessage[]).map((m) => [m.id, m as unknown as Item])),
        write: (_state, items) =>
          [...items.values()].sort((a, b) => num(a.createdAt) - num(b.createdAt)) as unknown as AppMessage[],
      },
    ],
  },
  { storeKey: 'jinesist.profile.v1', parts: [settingsPart('profile')] },
  { storeKey: 'jinesist.theme.v1', parts: [settingsPart('theme')] },
  { storeKey: 'jinesist.notifications.v1', parts: [settingsPart('notifications')] },
];

// The source and part a row from the cloud belongs to (null for anything this
// version of the app doesn't know).
export function partFor(collection: string, id: string): { source: Source; part: Part } | null {
  for (const source of SOURCES) {
    for (const part of source.parts) {
      if (part.collection === collection && (part.onlyId === undefined || part.onlyId === id)) return { source, part };
    }
  }
  return null;
}
