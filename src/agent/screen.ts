import { addDays, formatDayKey, MONTH_NAMES, MONTHS_SHORT, parseDayKey } from '../coach/days';
import { goalActivityName } from '../coach/goal';
import type { Goal } from '../coach/store';
import { noteTitle } from '../notes/format';
import type { Note } from '../notes/store';
import { describeEventTime } from '../schedule/format';
import { eventOccurrencesOnDay } from '../schedule/occurrences';
import type { ScheduleEvent } from '../schedule/store';

// What the user is looking at on desktop, so the coach can follow "this", "here",
// "this week". Sent as a short extra block on each request — kept small on purpose,
// since every token counts against the Gemini free tier.

export type CoachScreen =
  | { screen: 'today' }
  | { screen: 'schedule'; mode: 'day' | 'week' | 'month'; from: string; to: string }
  | { screen: 'goals' }
  | { screen: 'journal' }
  | { screen: 'note'; note: Note };

const MAX_NOTE_CHARS = 2000;
const MAX_SCHEDULE_ITEMS = 25;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// "21–27 Sep", or "28 Sep – 4 Oct" across a month boundary.
function rangeLabel(from: string, to: string): string {
  const a = parseDayKey(from)!;
  const b = parseDayKey(to)!;
  if (a.month === b.month) return `${a.day}–${b.day} ${MONTHS_SHORT[b.month - 1]}`;
  return `${a.day} ${MONTHS_SHORT[a.month - 1]} – ${b.day} ${MONTHS_SHORT[b.month - 1]}`;
}

// The panel header's "Sees: …" line.
export function screenLabel(s: CoachScreen, todayKey: string): string {
  switch (s.screen) {
    case 'today':
      return 'Today';
    case 'goals':
      return 'Goals';
    case 'journal':
      return 'Journal';
    case 'note':
      return clip(noteTitle(s.note) || 'Note', 40);
    case 'schedule': {
      if (s.mode === 'day') return `Schedule · ${formatDayKey(s.from, todayKey)}`;
      if (s.mode === 'month') {
        const p = parseDayKey(s.from)!;
        return `Schedule · ${MONTH_NAMES[p.month - 1]}`;
      }
      return `Schedule · ${rangeLabel(s.from, s.to)}`;
    }
  }
}

function noteBody(note: Note): string {
  if (note.type === 'quick') return note.text;
  if (note.type === 'checklist') return note.items.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n');
  return [
    note.ingredients.length ? `Ingredients:\n${note.ingredients.map((i) => `- ${i}`).join('\n')}` : '',
    note.steps.length ? `Steps:\n${note.steps.map((st, i) => `${i + 1}. ${st}`).join('\n')}` : '',
    note.notes ? `Notes: ${note.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// The ON SCREEN block for the request.
export function describeScreen(s: CoachScreen, events: ScheduleEvent[], todayKey: string): string {
  switch (s.screen) {
    case 'today':
      return 'ON SCREEN: the Today page (featured goal, today\'s to-dos and what\'s done).';
    case 'goals':
      return 'ON SCREEN: the Goals page.';
    case 'journal':
      return 'ON SCREEN: the Journal list (quick notes, checklists, recipes, to-buy).';
    case 'note': {
      const kind = s.note.type === 'quick' ? 'quick note' : s.note.type;
      return (
        `ON SCREEN: an open Journal ${kind}, "${noteTitle(s.note)}" (id: ${s.note.id}). ` +
        `"This note" / "this" means it. Its content:\n${clip(noteBody(s.note), MAX_NOTE_CHARS)}`
      );
    }
    case 'schedule': {
      const lines: string[] = [];
      let count = 0;
      for (let day = s.from; day <= s.to; day = addDays(day, 1)) {
        const occurrences = eventOccurrencesOnDay(events, day);
        count += occurrences.length;
        if (lines.length >= MAX_SCHEDULE_ITEMS || occurrences.length === 0) continue;
        const items = occurrences.map(({ event }) => `${event.title} ${describeEventTime(event)} (id: ${event.id})`);
        lines.push(`- ${formatDayKey(day, todayKey)} (${day}): ${items.join('; ')}`);
      }
      const shown = s.mode === 'week' ? 'week' : s.mode === 'day' ? 'day' : 'month';
      return [
        `ON SCREEN: the Schedule, ${shown} of ${formatDayKey(s.from, todayKey)} – ${formatDayKey(s.to, todayKey)}. ` +
          `"This week" / "here" means this range. Events in it (${count}):`,
        ...(lines.length ? lines : ['- nothing scheduled']),
      ].join('\n');
    }
  }
}

// Two or three one-tap prompts above the input, depending on the screen.
export function screenSuggestions(s: CoachScreen, featured: Goal): string[] {
  switch (s.screen) {
    case 'today':
      return [`Log 20 ${goalActivityName(featured.title).toLowerCase()}`, 'Plan my evening'];
    case 'schedule':
      return ['Show free time this week', 'Move my next event'];
    case 'note':
      return ['Turn this into tasks', 'Summarise this note'];
    case 'goals':
      return ['How am I tracking?', 'What should I focus on today?'];
    case 'journal':
      return ['What have I been noting lately?'];
  }
}
