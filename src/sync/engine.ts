import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { registeredStore, type PersistedStore } from '../storage/persistedStore';
import { CHAT_SYNC_LIMIT, partFor, SOURCES, type Collection, type Part, type Source } from './collections';
import { finishRedirectSignIn, supabase } from './client';
import { syncPhotos } from './photos';
import { getSyncStatus, setSyncStatus } from './status';

// Offline-first sync. The stores stay the source of truth on each device; this keeps
// a note of when each item last changed here, uploads what changed, downloads what
// changed elsewhere, and settles any difference item by item: the newest edit wins.
//
// How a change is noticed: every store is watched, and after a change each of its
// items is compared (by a hash) with what was last seen. So the stores and the code
// that edits them don't know sync exists. A deleted item leaves a small "deleted"
// marker, so the deletion travels too instead of the item coming back.

const META_KEY = 'jinesist.sync.v1';
const SCAN_DELAY_MS = 300; // after a change, before comparing
const PUSH_DELAY_MS = 2000; // after a change, before uploading
const PULL_EVERY_MS = 60_000; // while the app is open and in front
const PULL_OVERLAP_MS = 60_000; // re-read a little before the last download, in case a write landed late
const PUSH_BATCH = 100;
const PULL_PAGE = 1000;
const SHOW_SYNCING_AFTER_MS = 400; // a quick round doesn't flash "Syncing…"

// What this device knows about one item: the hash of the version it has (null once
// deleted), when that version was made, and whether the cloud has it yet.
interface Mark {
  h: string | null;
  e: number;
  s: 0 | 1;
}

interface Meta {
  userId: string | null; // the account these marks were synced with
  cursor: string | null; // the newest cloud change already downloaded
  items: Partial<Record<Collection, Record<string, Mark>>>;
  photos: Record<string, 1>; // recipe photos known to be online (see sync/photos.ts)
}

interface Row {
  collection: string;
  item_id: string;
  data: Record<string, unknown> | null;
  deleted: boolean;
  edited_at: number;
  updated_at: string;
}

let meta: Meta = { userId: null, cursor: null, items: {}, photos: {} };
let userId: string | null = null;
let started = false;

// ---- hashing: a stable fingerprint of an item, whatever order its keys are in (the
// database hands them back sorted differently).

const hashes = new WeakMap<object, string>();

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(record[k])}`).join(',')}}`;
}

// Stores replace an item when it changes and keep the same object when it doesn't,
// so a cache by object makes comparing a whole store cheap.
function hashOf(item: object): string {
  const cached = hashes.get(item);
  if (cached) return cached;
  const text = stable(item);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const result = `${(h >>> 0).toString(36)}.${text.length}`;
  hashes.set(item, result);
  return result;
}

// ---- the marks, saved on the device

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function saveMetaSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    AsyncStorage.setItem(META_KEY, JSON.stringify(meta)).catch((err) => console.warn('Failed to save sync state', err));
  }, 500);
}

async function loadMeta() {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Meta>;
    meta = {
      userId: typeof parsed.userId === 'string' ? parsed.userId : null,
      cursor: typeof parsed.cursor === 'string' ? parsed.cursor : null,
      items: typeof parsed.items === 'object' && parsed.items !== null ? parsed.items : {},
      photos: typeof parsed.photos === 'object' && parsed.photos !== null ? parsed.photos : {},
    };
  } catch (err) {
    console.warn('Failed to load sync state', err);
  }
}

const marksOf = (collection: Collection) => (meta.items[collection] ??= {});
const storeOf = (source: Source) => registeredStore(source.storeKey) as PersistedStore<unknown> | undefined;

// The ids a part owns among its collection's marks (settings share one collection).
const ownsId = (part: Part, id: string) => part.onlyId === undefined || part.onlyId === id;

function updatePending() {
  let pending = 0;
  for (const marks of Object.values(meta.items)) for (const m of Object.values(marks ?? {})) if (!m.s) pending++;
  if (pending !== getSyncStatus().pending) setSyncStatus({ pending });
}

// ---- noticing local changes

// When an item with no mark yet was made: now; or, on the first look after the app
// starts, its best guess from the item itself (see Part.legacyTime), for data from
// before sync existed; or "older than anything" (see forgetSyncState).
type NewItemTime = 'now' | 'legacy' | 'oldest';

// Compares the given stores with the marks and records what changed here.
function scan(sources: Iterable<Source>, newItems: NewItemTime) {
  const now = Date.now();
  let changed = false;
  for (const source of sources) {
    const store = storeOf(source);
    if (!store) continue;
    const state = store.get();
    for (const part of source.parts) {
      const marks = marksOf(part.collection);
      const items = part.read(state);
      for (const [id, item] of items) {
        const h = hashOf(item);
        const mark = marks[id];
        if (mark && mark.h === h) continue;
        const e = mark
          ? Math.max(now, mark.e + 1)
          : newItems === 'legacy'
            ? part.legacyTime(item)
            : newItems === 'oldest'
              ? 0
              : now;
        marks[id] = { h, e, s: 0 };
        changed = true;
      }
      for (const [id, mark] of Object.entries(marks)) {
        if (!ownsId(part, id) || mark.h === null || items.has(id)) continue;
        marks[id] = { h: null, e: Math.max(now, mark.e + 1), s: 0 };
        changed = true;
      }
    }
  }
  if (changed) saveMetaSoon();
  updatePending();
  return changed;
}

const dirty = new Set<Source>();
let scanTimer: ReturnType<typeof setTimeout> | undefined;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

function onStoreChange(source: Source) {
  dirty.add(source);
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    const sources = [...dirty];
    dirty.clear();
    if (scan(sources, 'now') && userId) schedulePush();
  }, SCAN_DELAY_MS);
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void syncNow(), PUSH_DELAY_MS);
}

// ---- uploading

// The ids of the newest chat messages, the only ones that go to the cloud.
function newestChatIds(): Set<string> {
  const chat = SOURCES.find((s) => s.parts.some((p) => p.collection === 'chat'));
  const store = chat && storeOf(chat);
  if (!chat || !store) return new Set();
  const messages = [...chat.parts[0].read(store.get()).values()];
  messages.sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));
  return new Set(messages.slice(0, CHAT_SYNC_LIMIT).map((m) => String(m.id)));
}

async function push() {
  if (!supabase) return;
  scan(SOURCES, 'now');
  const rows: Omit<Row, 'updated_at'>[] = [];
  const chatIds = newestChatIds();
  for (const source of SOURCES) {
    const store = storeOf(source);
    if (!store) continue;
    const state = store.get();
    for (const part of source.parts) {
      const marks = marksOf(part.collection);
      let items: Map<string, Record<string, unknown>> | null = null;
      for (const [id, mark] of Object.entries(marks)) {
        if (mark.s || !ownsId(part, id)) continue;
        if (part.collection === 'chat' && mark.h !== null && !chatIds.has(id)) {
          mark.s = 1; // an old message: stays on this device only
          continue;
        }
        if (mark.h === null) {
          rows.push({ collection: part.collection, item_id: id, data: null, deleted: true, edited_at: mark.e });
          continue;
        }
        items ??= part.read(state);
        const item = items.get(id);
        if (item) rows.push({ collection: part.collection, item_id: id, data: item, deleted: false, edited_at: mark.e });
      }
    }
  }

  for (let i = 0; i < rows.length; i += PUSH_BATCH) {
    const batch = rows.slice(i, i + PUSH_BATCH);
    const { error } = await supabase.rpc('push_items', { items: batch });
    if (error) throw error;
    for (const row of batch) {
      const mark = marksOf(row.collection as Collection)[row.item_id];
      // Only if it wasn't changed again while this was on its way.
      if (mark && mark.e === row.edited_at) mark.s = 1;
    }
    saveMetaSoon();
  }
  if (rows.some((r) => r.collection === 'chat')) {
    const { error } = await supabase.rpc('prune_chat', { keep: CHAT_SYNC_LIMIT });
    if (error) throw error;
  }
  updatePending();
}

// ---- downloading

async function pull() {
  if (!supabase || !userId) return;
  const since = meta.cursor ? new Date(Date.parse(meta.cursor) - PULL_OVERLAP_MS).toISOString() : null;
  const rows: Row[] = [];
  for (let from = 0; ; from += PULL_PAGE) {
    let query = supabase
      .from('sync_items')
      .select('collection,item_id,data,deleted,edited_at,updated_at')
      .eq('user_id', userId)
      .order('updated_at')
      .order('collection')
      .order('item_id')
      .range(from, from + PULL_PAGE - 1);
    if (since) query = query.gt('updated_at', since);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data as Row[]));
    if (data.length < PULL_PAGE) break;
  }
  if (rows.length > 0) applyRows(rows);
  for (const row of rows) {
    if (!meta.cursor || Date.parse(row.updated_at) > Date.parse(meta.cursor)) meta.cursor = row.updated_at;
  }
  saveMetaSoon();
}

// Puts what came from the cloud into the stores, item by item, where it's newer than
// (or, on a tie, differs from) what's here.
function applyRows(rows: Row[]) {
  const bySource = new Map<Source, { part: Part; row: Row }[]>();
  for (const row of rows) {
    const found = partFor(row.collection, row.item_id);
    if (!found) continue; // from a newer version of the app: leave it alone
    const list = bySource.get(found.source) ?? [];
    list.push({ part: found.part, row });
    bySource.set(found.source, list);
  }

  for (const [source, list] of bySource) {
    const store = storeOf(source);
    if (!store) continue;
    let state = store.get();
    const applied = new Map<string, { part: Part; id: string }>();
    let touched = false;

    for (const part of source.parts) {
      const mine = list.filter((x) => x.part === part).map((x) => x.row);
      if (mine.length === 0) continue;
      const marks = marksOf(part.collection);
      const items = part.read(state);
      let partTouched = false;
      for (const row of mine) {
        const mark = marks[row.item_id];
        const editedAt = Number(row.edited_at);
        if (mark && editedAt < mark.e) continue; // this device's edit is newer; it goes up next
        if (row.deleted || row.data === null) {
          if (items.delete(row.item_id)) partTouched = true;
          marks[row.item_id] = { h: null, e: editedAt, s: 1 };
          continue;
        }
        if (typeof row.data !== 'object') continue;
        const h = hashOf(row.data);
        if (!mark || mark.h !== h) {
          items.set(row.item_id, row.data);
          applied.set(`${part.collection}:${row.item_id}`, { part, id: row.item_id });
          partTouched = true;
        }
        marks[row.item_id] = { h, e: editedAt, s: 1 };
      }
      if (partTouched) {
        state = part.write(state, items);
        touched = true;
      }
    }
    if (!touched) continue;

    const editedAt = (collection: Collection, id: string) => meta.items[collection]?.[id]?.e ?? 0;
    if (source.prepare) state = source.prepare(state, new Set(applied.keys()), editedAt);
    state = store.normalize(state);
    // Fingerprint what arrived as the store keeps it, so tidying it up on the way
    // in isn't mistaken for an edit made here.
    for (const { part, id } of applied.values()) {
      const item = part.read(state).get(id);
      const mark = marksOf(part.collection)[id];
      if (item && mark) mark.h = hashOf(item);
    }
    if (source.fixup) state = source.fixup(state);
    store.set(state);
  }
  saveMetaSoon();
  // What a fixup changed counts as an edit here, and goes back up.
  scan(bySource.keys(), 'now');
}

// ---- one round: upload, download, upload whatever settling the two produced

let running = false;
let again = false;

const isOffline = (err: unknown) => {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = err instanceof Error ? err.message : typeof err === 'object' && err ? String((err as { message?: unknown }).message) : String(err);
  return /failed to fetch|network request failed|networkerror|load failed|fetch failed/i.test(message);
};

const describe = (err: unknown) =>
  typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message) : String(err);

export async function syncNow(): Promise<void> {
  if (!supabase || !userId) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  clearTimeout(pushTimer);
  const showSyncing = setTimeout(() => setSyncStatus({ phase: 'syncing' }), SHOW_SYNCING_AFTER_MS);
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('Failed to fetch');
    }
    await push();
    await pull();
    if (getSyncStatus().pending > 0) await push();
    await syncPhotos(supabase, userId, meta.photos);
    saveMetaSoon();
    setSyncStatus({ phase: 'synced', lastSyncedAt: Date.now(), message: null });
  } catch (err) {
    setSyncStatus(isOffline(err) ? { phase: 'offline', message: null } : { phase: 'error', message: describe(err) });
  } finally {
    clearTimeout(showSyncing);
    running = false;
    if (again) {
      again = false;
      void syncNow();
    }
  }
}

// ---- signing in and out

function onSession(session: Session | null) {
  const id = session?.user.id ?? null;
  if (id === userId) return;
  userId = id;
  if (!id) {
    setSyncStatus({ phase: 'off', email: null, message: null });
    return;
  }
  // The first time this device syncs with this account, everything here goes up
  // and everything there comes down (and they're merged item by item).
  if (meta.userId !== id) {
    for (const marks of Object.values(meta.items)) for (const mark of Object.values(marks ?? {})) mark.s = 0;
    meta.cursor = null;
    meta.photos = {};
    meta.userId = id;
    saveMetaSoon();
  }
  setSyncStatus({ email: session?.user.email ?? null, phase: 'syncing', message: null });
  void syncNow();
}

// "Reset all data" while signed out (call it after the reset): this device forgets
// what it synced, and what's left counts as older than anything in the cloud, so
// signing in again brings the cloud copy back rather than the empty one.
export function forgetSyncState() {
  meta = { userId: null, cursor: null, items: {}, photos: {} };
  scan(SOURCES, 'oldest');
  saveMetaSoon();
}

export const isSignedIn = () => userId !== null;

// ---- start

export async function startSync() {
  if (started) return;
  started = true;
  const watched = SOURCES.map((source) => ({ source, store: storeOf(source) })).filter((x) => x.store);
  await Promise.all(watched.map((x) => x.store!.ready));
  await loadMeta();
  scan(SOURCES, 'legacy');
  for (const { source, store } of watched) store!.subscribe(() => onStoreChange(source));

  if (!supabase) return;
  const redirectError = await finishRedirectSignIn();
  if (redirectError) setSyncStatus({ phase: 'error', message: redirectError });
  // Deferred: Supabase asks that nothing awaits its client inside this callback.
  supabase.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => onSession(session), 0);
  });

  setInterval(() => {
    const visible = Platform.OS !== 'web' || typeof document === 'undefined' || document.visibilityState === 'visible';
    if (visible) void syncNow();
  }, PULL_EVERY_MS);

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void syncNow();
    });
    window.addEventListener('online', () => void syncNow());
    window.addEventListener('offline', () => {
      if (userId) setSyncStatus({ phase: 'offline' });
    });
  } else {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNow();
    });
  }
}
