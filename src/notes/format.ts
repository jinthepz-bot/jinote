import { dayKey, formatDayKey } from '../coach/days';
import type { Note, NoteType } from './store';

// What the desktop Journal calls each kind of note: the sidebar sub-link, and the
// middle step of a note page's breadcrumb.
export const SECTION_LABELS: Record<NoteType, string> = {
  quick: 'Quick notes',
  checklist: 'Checklists',
  recipe: 'Recipes',
};

// A quick note has no title of its own; its first line plays that part, the way it
// does in most notes apps. Everything after the first line break is the body.
export function splitQuickNote(text: string): { title: string; body: string } {
  const newline = text.indexOf('\n');
  if (newline === -1) return { title: text.trim(), body: '' };
  return { title: text.slice(0, newline).trim(), body: text.slice(newline + 1).replace(/^\n+/, '') };
}

export function joinQuickNote(title: string, body: string): string {
  return body.trim() ? `${title.trim()}\n${body}` : title.trim();
}

export function noteTitle(note: Note): string {
  return note.type === 'quick' ? splitQuickNote(note.text).title : note.title;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

// The grid cards' shorter form: "Edited just now", "Edited 5m ago", "Edited 2h ago",
// "Edited yesterday", "Edited 3d ago", then the date.
export function editedShort(timestamp: number, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - timestamp) / 60_000));
  if (minutes < 1) return 'Edited just now';
  if (minutes < 60) return `Edited ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Edited ${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Edited yesterday';
  if (days < 7) return `Edited ${days}d ago`;
  return `Edited ${formatDayKey(dayKey(new Date(timestamp)), dayKey(new Date(now)))}`;
}

// "Edited just now", "Edited 5 minutes ago", "Edited yesterday", "Edited Mon 21 Sep".
export function editedAgo(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return 'Edited just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Edited ${plural(minutes, 'minute')} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Edited ${plural(hours, 'hour')} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Edited yesterday';
  if (days < 7) return `Edited ${days} days ago`;
  return `Edited ${formatDayKey(dayKey(new Date(timestamp)), dayKey(new Date(now)))}`;
}
