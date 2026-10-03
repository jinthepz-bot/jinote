import AsyncStorage from '@react-native-async-storage/async-storage';

import { createPersistedStore } from '../storage/persistedStore';

export type NoteType = 'quick' | 'recipe' | 'checklist';
export const RECIPE_CATEGORIES = ['Western', 'Japanese', 'Dessert', 'Main dish', 'Beverage'] as const;
export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

export interface QuickNote {
  id: string;
  type: 'quick';
  text: string;
  createdAt: number;
  updatedAt: number; // last content change; notes from before this existed use createdAt
  pinnedAt: number | null; // when it was pinned to the desktop sidebar, or null
  tags: string[]; // optional labels for the desktop Journal's filter chips; none by default
  folderId: string | null; // the one folder it's filed in, or null
  cover: CoverId | null; // the note page's coloured strip, or null
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface ChecklistNote {
  id: string;
  type: 'checklist';
  title: string;
  items: ChecklistItem[];
  createdAt: number;
  updatedAt: number; // last content change; notes from before this existed use createdAt
  pinnedAt: number | null; // when it was pinned to the desktop sidebar, or null
  tags: string[]; // optional labels for the desktop Journal's filter chips; none by default
  folderId: string | null; // the one folder it's filed in, or null
  cover: CoverId | null; // the note page's coloured strip, or null
}

export interface RecipeNote {
  id: string;
  type: 'recipe';
  title: string;
  photoUri: string | null; // "photo:<id>" (see notes/photos.ts), or an older note's file:// path; never image bytes
  cookTime: string;
  category: RecipeCategory;
  rating: 1 | 2 | 3;
  ingredients: string[];
  steps: string[];
  notes: string; // free text: cook time, servings, where it's from, etc.
  createdAt: number;
  updatedAt: number; // last content change; notes from before this existed use createdAt
  pinnedAt: number | null; // when it was pinned to the desktop sidebar, or null
  tags: string[]; // optional labels for the desktop Journal's filter chips; none by default
  folderId: string | null; // the one folder it's filed in, or null
  cover: CoverId | null; // the note page's coloured strip, or null
}

export type Note = QuickNote | ChecklistNote | RecipeNote;

export const COVER_IDS = ['sand', 'peach', 'sage', 'sky', 'rose'] as const;
export type CoverId = (typeof COVER_IDS)[number];

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

interface NotesState {
  notes: Note[]; // newest first
  folders: Folder[]; // in the order they were made
}

export const MAX_FOLDER_NAME = 40;

export interface NewRecipeInput {
  title: string;
  photoUri: string | null;
  cookTime: string;
  category: RecipeCategory;
  rating: 1 | 2 | 3;
  ingredients: string[];
  steps: string[];
  notes: string;
}

const KEY = 'jinesist.notes.v1';
const LEGACY_JOURNAL_KEY = 'jinesist.journal.v1'; // Stage 3-5 format: plain-text-only entries

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function records(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : [];
}

function strArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
    : [];
}

// Tags are stored as typed (trimmed, without a leading "#"), with case-insensitive
// duplicates dropped, so "Travel" and "travel" are one tag.
export const MAX_TAG_LENGTH = 24;

export function cleanTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH).trim();
}

function normalizeTags(v: unknown): string[] {
  const out: string[] = [];
  for (const raw of Array.isArray(v) ? v : []) {
    if (typeof raw !== 'string') continue;
    const tag = cleanTag(raw);
    if (tag && !out.some((t) => t.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  return out;
}

function recipeCategory(v: unknown): RecipeCategory {
  return RECIPE_CATEGORIES.includes(v as RecipeCategory) ? (v as RecipeCategory) : 'Main dish';
}

function recipeRating(v: unknown): 1 | 2 | 3 {
  return v === 2 || v === 3 ? v : 1;
}

function normalizeChecklistItems(v: unknown): ChecklistItem[] {
  return records(v)
    .filter((i) => typeof i.id === 'string' && typeof i.text === 'string' && i.text.trim() !== '')
    .map((i) => ({ id: i.id as string, text: (i.text as string).trim(), done: i.done === true }));
}

// Accepts whatever was stored and keeps only well-formed notes.
function normalize(raw: unknown): NotesState {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  const folders: Folder[] = [];
  for (const f of records(obj.folders)) {
    if (typeof f.id !== 'string' || typeof f.name !== 'string' || !f.name.trim()) continue;
    if (folders.some((x) => x.id === f.id)) continue;
    folders.push({ id: f.id, name: f.name.trim().slice(0, MAX_FOLDER_NAME), createdAt: isNum(f.createdAt) ? f.createdAt : 0 });
  }
  const folderIds = new Set(folders.map((f) => f.id));

  const notes: Note[] = [];
  for (const n of records(obj.notes)) {
    if (typeof n.id !== 'string' || notes.some((x) => x.id === n.id)) continue;
    const createdAt = isNum(n.createdAt) ? n.createdAt : 0;
    const updatedAt = isNum(n.updatedAt) ? n.updatedAt : createdAt;
    const pinnedAt = isNum(n.pinnedAt) ? n.pinnedAt : null;
    const tags = normalizeTags(n.tags); // absent on notes saved before tags existed
    // Absent on notes saved before folders and covers existed. A folder that's gone
    // (say, from a hand-edited backup) leaves the note un-filed.
    const folderId = typeof n.folderId === 'string' && folderIds.has(n.folderId) ? n.folderId : null;
    const cover = COVER_IDS.includes(n.cover as CoverId) ? (n.cover as CoverId) : null;

    if (n.type === 'quick') {
      if (typeof n.text !== 'string' || n.text.trim() === '') continue;
      notes.push({ id: n.id, type: 'quick', text: n.text.trim(), createdAt, updatedAt, pinnedAt, tags, folderId, cover });
    } else if (n.type === 'checklist') {
      if (typeof n.title !== 'string' || n.title.trim() === '') continue;
      notes.push({
        id: n.id,
        type: 'checklist',
        title: n.title.trim(),
        items: normalizeChecklistItems(n.items),
        createdAt,
        updatedAt,
        pinnedAt,
        tags,
        folderId,
        cover,
      });
    } else if (n.type === 'recipe') {
      if (typeof n.title !== 'string' || n.title.trim() === '') continue;
      notes.push({
        id: n.id,
        type: 'recipe',
        title: n.title.trim(),
        photoUri: typeof n.photoUri === 'string' && n.photoUri !== '' ? n.photoUri : null,
        cookTime: str(n.cookTime),
        category: recipeCategory(n.category),
        rating: recipeRating(n.rating),
        ingredients: strArray(n.ingredients),
        steps: strArray(n.steps),
        notes: str(n.notes),
        createdAt,
        updatedAt,
        pinnedAt,
        tags,
        folderId,
        cover,
      });
    }
  }
  notes.sort((a, b) => b.createdAt - a.createdAt);

  return { notes, folders };
}

// Converts Stage 3-5 journal entries (plain text only) into quick notes.
async function migrateFromJournal(): Promise<NotesState | null> {
  const raw = await AsyncStorage.getItem(LEGACY_JOURNAL_KEY);
  if (raw === null) return null;
  const old = JSON.parse(raw) as { entries?: unknown };
  return normalize({
    notes: records(old.entries).map((e) => ({ id: e.id, type: 'quick', text: e.text, createdAt: e.createdAt })),
  });
}

const store = createPersistedStore<NotesState>({
  key: KEY,
  initial: { notes: [], folders: [] },
  normalize,
  migrate: migrateFromJournal,
  label: 'notes',
});

export const notesReady = store.ready;

// Replaces everything from a backup file, through the same validation as a load.
export function importNotes(raw: unknown) {
  store.set(normalize(raw));
}
export const getNotesState = store.get;
export const useNotes = () => store.useStore();

// --- quick notes

// Saves a note stamped with the current date and time. `createdAt` is only passed
// when bringing over older data that already has a timestamp.
export function addQuickNote(text: string, createdAt: number = Date.now()): QuickNote | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const note: QuickNote = {
    id: newId('note'),
    type: 'quick',
    text: trimmed,
    createdAt,
    updatedAt: createdAt,
    pinnedAt: null,
    tags: [],
    folderId: null,
    cover: null,
  };
  store.update((s) => ({ ...s, notes: [note, ...s.notes].sort((a, b) => b.createdAt - a.createdAt) }));
  return note;
}

// Rewrites a quick note's text from the desktop writing page. An empty note isn't a
// valid note (the loader would drop it), so clearing everything keeps the last text.
export function updateQuickNote(id: string, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  store.update((s) => ({
    ...s,
    notes: s.notes.map((n) =>
      n.id === id && n.type === 'quick' && n.text !== trimmed ? { ...n, text: trimmed, updatedAt: Date.now() } : n,
    ),
  }));
}

// --- checklists

export function addChecklist(title: string, itemTexts: string[]): ChecklistNote | null {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return null;
  const items: ChecklistItem[] = itemTexts
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text) => ({ id: newId('item'), text, done: false }));
  const now = Date.now();
  const note: ChecklistNote = {
    id: newId('note'),
    type: 'checklist',
    title: trimmedTitle,
    items,
    createdAt: now,
    updatedAt: now,
    pinnedAt: null,
    tags: [],
    folderId: null,
    cover: null,
  };
  store.update((s) => ({ ...s, notes: [note, ...s.notes] }));
  return note;
}

export function toggleChecklistItem(noteId: string, itemId: string): void {
  store.update((s) => ({
    ...s,
    notes: s.notes.map((n) =>
      n.id === noteId && n.type === 'checklist'
        ? { ...n, items: n.items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)), updatedAt: Date.now() }
        : n,
    ),
  }));
}

export function addChecklistItem(noteId: string, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  store.update((s) => ({
    ...s,
    notes: s.notes.map((n) =>
      n.id === noteId && n.type === 'checklist'
        ? { ...n, items: [...n.items, { id: newId('item'), text: trimmed, done: false }], updatedAt: Date.now() }
        : n,
    ),
  }));
}

export function deleteChecklistItem(noteId: string, itemId: string): void {
  store.update((s) => ({
    ...s,
    notes: s.notes.map((n) =>
      n.id === noteId && n.type === 'checklist'
        ? { ...n, items: n.items.filter((i) => i.id !== itemId), updatedAt: Date.now() }
        : n,
    ),
  }));
}

// --- recipes

export function addRecipe(input: NewRecipeInput): RecipeNote | null {
  const title = input.title.trim();
  if (!title) return null;
  const note: RecipeNote = {
    id: newId('note'),
    type: 'recipe',
    title,
    photoUri: input.photoUri,
    cookTime: input.cookTime.trim(),
    category: input.category,
    rating: input.rating,
    ingredients: input.ingredients.map((i) => i.trim()).filter(Boolean),
    steps: input.steps.map((s) => s.trim()).filter(Boolean),
    notes: input.notes.trim(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinnedAt: null,
    tags: [],
    folderId: null,
    cover: null,
  };
  store.update((s) => ({ ...s, notes: [note, ...s.notes] }));
  return note;
}

// --- shared

// Pinning is about where a note is kept, not what it says, so it leaves updatedAt alone.
export function setPinned(id: string, pinned: boolean): void {
  store.update((s) => ({
    ...s,
    notes: s.notes.map((n) => (n.id === id ? { ...n, pinnedAt: pinned ? Date.now() : null } : n)),
  }));
}

// --- folders

export function addFolder(name: string): Folder | null {
  const trimmed = name.trim().slice(0, MAX_FOLDER_NAME);
  if (!trimmed) return null;
  const folder: Folder = { id: newId('folder'), name: trimmed, createdAt: Date.now() };
  store.update((s) => ({ ...s, folders: [...s.folders, folder] }));
  return folder;
}

export function renameFolder(id: string, name: string): void {
  const trimmed = name.trim().slice(0, MAX_FOLDER_NAME);
  if (!trimmed) return;
  store.update((s) => ({ ...s, folders: s.folders.map((f) => (f.id === id ? { ...f, name: trimmed } : f)) }));
}

// The notes stay; they just aren't filed anywhere any more.
export function deleteFolder(id: string): void {
  store.update((s) => ({
    folders: s.folders.filter((f) => f.id !== id),
    notes: s.notes.map((n) => (n.folderId === id ? { ...n, folderId: null } : n)),
  }));
}

// Filing, like pinning, leaves updatedAt alone.
export function setNoteFolder(noteId: string, folderId: string | null): void {
  store.update((s) => ({
    ...s,
    notes: s.notes.map((n) =>
      n.id === noteId && (folderId === null || s.folders.some((f) => f.id === folderId)) ? { ...n, folderId } : n,
    ),
  }));
}

export function setNoteCover(noteId: string, cover: CoverId | null): void {
  store.update((s) => ({ ...s, notes: s.notes.map((n) => (n.id === noteId ? { ...n, cover } : n)) }));
}

// Tags are about how a note is filed, like pinning, so they leave updatedAt alone
// too — adding one doesn't jump the note to the top of "Recent".
export function addTag(id: string, raw: string): void {
  const tag = cleanTag(raw);
  if (!tag) return;
  store.update((s) => ({
    ...s,
    notes: s.notes.map((n) =>
      n.id === id && !n.tags.some((t) => t.toLowerCase() === tag.toLowerCase()) ? { ...n, tags: [...n.tags, tag] } : n,
    ),
  }));
}

export function removeTag(id: string, tag: string): void {
  store.update((s) => ({
    ...s,
    notes: s.notes.map((n) => (n.id === id ? { ...n, tags: n.tags.filter((t) => t !== tag) } : n)),
  }));
}

// Every tag in use, most used first (ties alphabetical). The first spelling seen wins.
export function tagsInUse(notes: Note[]): string[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const n of notes) {
    for (const tag of n.tags) {
      const key = tag.toLowerCase();
      const seen = counts.get(key);
      counts.set(key, { tag: seen?.tag ?? tag, count: (seen?.count ?? 0) + 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .map((c) => c.tag);
}

export function hasTag(note: Note, tag: string): boolean {
  return note.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
}

// Pinned notes in the order they were pinned, oldest first, so the sidebar list
// doesn't reshuffle every time something new is pinned.
export function pinnedNotes(notes: Note[]): Note[] {
  return notes.filter((n) => n.pinnedAt !== null).sort((a, b) => (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0));
}

// Deletes a note and returns it. If it was a recipe with a photo, the caller is
// responsible for also calling `deleteNotePhoto` (see notes/photos.ts) — this store
// has no native file-system dependency, on purpose, so its logic stays testable
// under plain Node.
export function deleteNote(id: string): Note | null {
  const note = store.get().notes.find((n) => n.id === id) ?? null;
  if (note) store.update((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== id) }));
  return note;
}

function textOf(note: Note): string[] {
  if (note.type === 'quick') return [note.text, ...note.tags];
  if (note.type === 'recipe') return [note.title, ...note.ingredients, ...note.steps, note.notes, ...note.tags];
  return [note.title, ...note.items.map((i) => i.text), ...note.tags];
}

// Matches a note's title and content against a query (case-insensitive substring).
export function matchesQuery(note: Note, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return textOf(note).some((s) => s.toLowerCase().includes(q));
}

export function searchNotes(notes: Note[], query: string): Note[] {
  return notes.filter((n) => matchesQuery(n, query));
}

// Clears every note and returns what was removed, so the caller can delete any
// recipe photo files (see the note on `deleteNote` above).
export function resetNotes(): Note[] {
  const notes = store.get().notes;
  store.set({ notes: [], folders: [] });
  return notes;
}
