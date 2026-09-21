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
}

export interface RecipeNote {
  id: string;
  type: 'recipe';
  title: string;
  photoUri: string | null; // local file:// path from expo-file-system; never image bytes
  cookTime: string;
  category: RecipeCategory;
  rating: 1 | 2 | 3;
  ingredients: string[];
  steps: string[];
  notes: string; // free text: cook time, servings, where it's from, etc.
  createdAt: number;
}

export type Note = QuickNote | ChecklistNote | RecipeNote;

interface NotesState {
  notes: Note[]; // newest first
}

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

  const notes: Note[] = [];
  for (const n of records(obj.notes)) {
    if (typeof n.id !== 'string' || notes.some((x) => x.id === n.id)) continue;
    const createdAt = isNum(n.createdAt) ? n.createdAt : 0;

    if (n.type === 'quick') {
      if (typeof n.text !== 'string' || n.text.trim() === '') continue;
      notes.push({ id: n.id, type: 'quick', text: n.text.trim(), createdAt });
    } else if (n.type === 'checklist') {
      if (typeof n.title !== 'string' || n.title.trim() === '') continue;
      notes.push({ id: n.id, type: 'checklist', title: n.title.trim(), items: normalizeChecklistItems(n.items), createdAt });
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
      });
    }
  }
  notes.sort((a, b) => b.createdAt - a.createdAt);

  return { notes };
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
  initial: { notes: [] },
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
  const note: QuickNote = { id: newId('note'), type: 'quick', text: trimmed, createdAt };
  store.update((s) => ({ notes: [note, ...s.notes].sort((a, b) => b.createdAt - a.createdAt) }));
  return note;
}

// --- checklists

export function addChecklist(title: string, itemTexts: string[]): ChecklistNote | null {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return null;
  const items: ChecklistItem[] = itemTexts
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text) => ({ id: newId('item'), text, done: false }));
  const note: ChecklistNote = { id: newId('note'), type: 'checklist', title: trimmedTitle, items, createdAt: Date.now() };
  store.update((s) => ({ notes: [note, ...s.notes] }));
  return note;
}

export function toggleChecklistItem(noteId: string, itemId: string): void {
  store.update((s) => ({
    notes: s.notes.map((n) =>
      n.id === noteId && n.type === 'checklist'
        ? { ...n, items: n.items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)) }
        : n,
    ),
  }));
}

export function addChecklistItem(noteId: string, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  store.update((s) => ({
    notes: s.notes.map((n) =>
      n.id === noteId && n.type === 'checklist'
        ? { ...n, items: [...n.items, { id: newId('item'), text: trimmed, done: false }] }
        : n,
    ),
  }));
}

export function deleteChecklistItem(noteId: string, itemId: string): void {
  store.update((s) => ({
    notes: s.notes.map((n) => (n.id === noteId && n.type === 'checklist' ? { ...n, items: n.items.filter((i) => i.id !== itemId) } : n)),
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
  };
  store.update((s) => ({ notes: [note, ...s.notes] }));
  return note;
}

// --- shared

// Deletes a note and returns it. If it was a recipe with a photo, the caller is
// responsible for also calling `deleteNotePhoto` (see notes/photos.ts) — this store
// has no native file-system dependency, on purpose, so its logic stays testable
// under plain Node.
export function deleteNote(id: string): Note | null {
  const note = store.get().notes.find((n) => n.id === id) ?? null;
  if (note) store.update((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
  return note;
}

function textOf(note: Note): string[] {
  if (note.type === 'quick') return [note.text];
  if (note.type === 'recipe') return [note.title, ...note.ingredients, ...note.steps, note.notes];
  return [note.title, ...note.items.map((i) => i.text)];
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
  store.set({ notes: [] });
  return notes;
}
