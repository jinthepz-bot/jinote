import { dayKey, formatTime } from '../coach/days';
import { formatAmount } from '../coach/format';
import { goalActivityName } from '../coach/goal';
import type { CoachState } from '../coach/store';
import { describeEventTime } from '../schedule/format';
import { eventOccurrencesOnDay } from '../schedule/occurrences';
import type { ScheduleEvent } from '../schedule/store';

// What actually happened on a day, pulled from the other stores: sets logged (one
// line per goal), events on the calendar, and tasks ticked off. Read-only — the
// Daily journal's "From today" card and the coach's context both use it.

export interface RecapItem {
  kind: 'set' | 'event' | 'task';
  id: string;
  text: string;
  time: string | null; // "07:30", "07:30–19:10" or null when unknown
  sortKey: string; // "HH:MM" to order by; "~" sorts untimed items last
}

export function dayRecap(coach: CoachState, events: ScheduleEvent[], date: string): RecapItem[] {
  const items: RecapItem[] = [];

  // Sets: summed per goal, timed from the first set to the last.
  const goals = new Map(coach.goals.map((g) => [g.id, g]));
  const byGoal = new Map<string, typeof coach.entries>();
  for (const e of coach.entries) {
    if (e.date !== date) continue;
    byGoal.set(e.goalId, [...(byGoal.get(e.goalId) ?? []), e]);
  }
  for (const [goalId, entries] of byGoal) {
    const goal = goals.get(goalId);
    const total = entries.reduce((sum, e) => sum + e.value, 0);
    const unit = goal?.unit ? ` ${goal.unit}` : '';
    const count = goal?.type === 'cumulative' ? `${entries.length} ${entries.length === 1 ? 'log' : 'logs'}` : `${entries.length} ${entries.length === 1 ? 'set' : 'sets'}`;
    const times = entries.filter((e) => e.loggedAt > 0).map((e) => e.loggedAt).sort((a, b) => a - b);
    const first = times.length ? formatTime(times[0]) : null;
    const last = times.length ? formatTime(times[times.length - 1]) : null;
    items.push({
      kind: 'set',
      id: `set-${goalId}`,
      text: `${goal ? goalActivityName(goal.title) : 'Progress'} · ${formatAmount(total)}${unit} · ${count}`,
      time: first && last && first !== last ? `${first}–${last}` : first,
      sortKey: first ?? '~',
    });
  }

  for (const { event, originalDate } of eventOccurrencesOnDay(events, date)) {
    items.push({
      kind: 'event',
      id: `event-${event.id}-${originalDate}`,
      text: event.title,
      time: describeEventTime(event),
      sortKey: event.startTime,
    });
  }

  // A task ticked off before completion times were recorded counts on its own date.
  for (const t of coach.tasks) {
    if (!t.done) continue;
    const onDay = t.completedAt !== null ? dayKey(new Date(t.completedAt)) === date : t.date === date;
    if (!onDay) continue;
    const time = t.completedAt !== null ? formatTime(t.completedAt) : null;
    items.push({ kind: 'task', id: `task-${t.id}`, text: t.text, time, sortKey: time ?? '~' });
  }

  return items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

// One line per item, for the coach: "07:30–19:10 Push-ups · 100 reps · 4 sets (set)".
export function describeRecap(items: RecapItem[]): string {
  if (items.length === 0) return '- nothing logged, scheduled or ticked off';
  const kind = { set: 'logged', event: 'event', task: 'task done' } as const;
  return items.map((i) => `- ${i.time ? `${i.time} ` : ''}${i.text} (${kind[i.kind]})`).join('\n');
}
