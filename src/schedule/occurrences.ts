import { addDays, weekdayIndex } from '../coach/days';
import { tasksOnDay, type Task } from '../coach/store';
import type { OccurrenceChange, ScheduleEvent } from './store';
import { compareTimes } from './time';

export interface Occurrence {
  event: ScheduleEvent;
  date: string;
}

// One row in a day's agenda: an event occurrence or a task due that day, so the
// two can be shown together in one time-ordered list (see DayRow).
export type DayItem =
  | { kind: 'event'; id: string; event: ScheduleEvent }
  | { kind: 'task'; id: string; task: Task };

// Whether a series' repeat rule alone puts an occurrence on `date` (one-day
// changes aside).
function onRule(event: ScheduleEvent, date: string): boolean {
  if (!event.days.includes(weekdayIndex(date))) return false;
  if (event.startDate && date < event.startDate) return false;
  if (event.endDate && date > event.endDate) return false;
  return true;
}

// One occurrence as it actually happens: `event` carries that day's times (which
// differ from the series' when it was changed on its own), and `originalDate` is the
// day the repeat rule put it on — what a one-day change is keyed by.
export interface ResolvedOccurrence {
  event: ScheduleEvent;
  originalDate: string;
}

// Every occurrence of `event` on `date`, with one-day changes applied: one moved
// away from `date` is gone, one moved onto it appears with its own times. Usually
// zero or one, but a changed occurrence can land on a day the series also meets.
// The series as it is on one occurrence that was changed on its own.
function applyChange(event: ScheduleEvent, change: OccurrenceChange): ScheduleEvent {
  return {
    ...event,
    startTime: change.startTime,
    endTime: change.endTime,
    title: change.title ?? event.title,
    location: change.location ?? event.location,
    note: change.note ?? event.note,
    color: change.color ?? event.color,
    reminderMinutesBefore: change.reminderMinutesBefore !== undefined ? change.reminderMinutesBefore : event.reminderMinutesBefore,
  };
}

export function occurrencesOn(event: ScheduleEvent, date: string): ResolvedOccurrence[] {
  if (event.type === 'one-off') return event.date === date ? [{ event, originalDate: date }] : [];
  const out: ResolvedOccurrence[] = [];
  const own = event.exceptions[date];
  if (onRule(event, date)) {
    if (!own) out.push({ event, originalDate: date });
    else if (own.date === date && !own.skipped) out.push({ event: applyChange(event, own), originalDate: date });
  }
  for (const [original, change] of Object.entries(event.exceptions)) {
    // A change whose own day no longer fits the rule (the series was edited since)
    // is ignored rather than conjuring an occurrence out of nowhere.
    if (original === date || change.skipped || change.date !== date || !onRule(event, original)) continue;
    out.push({ event: applyChange(event, change), originalDate: original });
  }
  return out;
}

// Whether `event` happens on `date` at all.
export function occursOn(event: ScheduleEvent, date: string): boolean {
  return occurrencesOn(event, date).length > 0;
}

// Every occurrence on `date` across `events`, earliest start first.
export function eventOccurrencesOnDay(events: ScheduleEvent[], date: string): ResolvedOccurrence[] {
  return events
    .flatMap((e) => occurrencesOn(e, date))
    .sort((a, b) => compareTimes(a.event.startTime, b.event.startTime));
}

// Every event happening on `date`, earliest start first, each carrying that day's
// actual times — so everything that lists a day (Today, the coach, reminders) sees an
// occurrence where it was moved to, not where the series would have put it.
export function eventsOnDay(events: ScheduleEvent[], date: string): ScheduleEvent[] {
  return eventOccurrencesOnDay(events, date).map((o) => o.event);
}

// Events and dated tasks due on `date`, merged into one time-ordered list. Untimed
// tasks (a date with no time) sort first, like an all-day item on a calendar.
export function agendaForDay(events: ScheduleEvent[], tasks: Task[], date: string): DayItem[] {
  const items: DayItem[] = [
    ...eventsOnDay(events, date).map((event): DayItem => ({ kind: 'event', id: event.id, event })),
    ...tasksOnDay(tasks, date).map((task): DayItem => ({ kind: 'task', id: task.id, task })),
  ];
  const timeOf = (item: DayItem) => (item.kind === 'event' ? item.event.startTime : (item.task.time ?? ''));
  return items.sort((a, b) => timeOf(a).localeCompare(timeOf(b)));
}

// The next date on or after `from` that `event` occurs, or null if it never will
// again (a past one-off, or a recurring event whose end date has already passed).
export function nextOccurrence(event: ScheduleEvent, from: string): string | null {
  if (event.type === 'one-off') return event.date && event.date >= from ? event.date : null;
  const start = event.startDate && event.startDate > from ? event.startDate : from;
  // Two weeks rather than one, and no early stop at the end date: with one-day
  // changes an occurrence can be moved past either.
  for (let i = 0; i < 14; i++) {
    const candidate = addDays(start, i);
    if (occursOn(event, candidate)) return candidate;
  }
  return null;
}

// Every occurrence of every event across `days` days starting at `from` (inclusive),
// earliest first — a recurring class contributes one row per week it meets in the
// window. Used to schedule reminders across a rolling window, unlike `upcomingOccurrences`
// below, which only wants each event's single soonest occurrence for a "coming up" list.
export function occurrencesInWindow(events: ScheduleEvent[], from: string, days: number): Occurrence[] {
  const out: Occurrence[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    for (const event of eventsOnDay(events, date)) out.push({ event, date });
  }
  return out;
}

// Each event's soonest occurrence on or after `from`, soonest first. A recurring
// class contributes one row here, not one per future week.
export function upcomingOccurrences(events: ScheduleEvent[], from: string, limit: number): Occurrence[] {
  return events
    .map((event) => {
      const date = nextOccurrence(event, from);
      // That day's own times, in case the occurrence was changed on its own.
      return date ? { event: occurrencesOn(event, date)[0]?.event ?? event, date } : null;
    })
    .filter((o): o is Occurrence => o !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || compareTimes(a.event.startTime, b.event.startTime))
    .slice(0, limit);
}
