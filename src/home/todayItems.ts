import { dayKey, formatTime } from '../coach/days';
import { goalActivityName } from '../coach/goal';
import type { CoachState, Task } from '../coach/store';
import { eventsOnDay } from '../schedule/occurrences';
import { describeEventTime } from '../schedule/format';
import type { CalendarKind } from '../schedule/calendar/items';
import type { ScheduleEvent } from '../schedule/store';

// Pure list-building for the desktop Home cards (see DesktopHome).

// The tag's colour is the calendar's, so the two screens say the same thing with the
// same hue: blue for events, neutral for tasks, red only ever for a goal deadline.
export type TodoItem =
  | { kind: 'event'; id: string; title: string; tag: string; tone: CalendarKind }
  | { kind: 'task'; id: string; task: Task; title: string; tag: string; tone: CalendarKind };

// Open tasks and events for today in one list. Items with a time come first, in time
// order (an event is a blue time range, a timed task a neutral "Due 15:00"); tasks with
// no time — undated ones and ones dated today — follow as "Anytime". Tasks dated
// another day live on Schedule, as on the phone.
export function todoForToday(events: ScheduleEvent[], tasks: Task[], todayKey: string): TodoItem[] {
  const timed: { time: string; item: TodoItem }[] = [];
  const anytime: TodoItem[] = [];

  for (const event of eventsOnDay(events, todayKey)) {
    timed.push({
      time: event.startTime,
      item: { kind: 'event', id: event.id, title: event.title, tag: describeEventTime(event), tone: 'event' },
    });
  }

  const open = tasks
    .filter((t) => !t.done && (t.date === null || t.date === todayKey))
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const task of open) {
    if (task.date === todayKey && task.time) {
      timed.push({
        time: task.time,
        item: { kind: 'task', id: task.id, task, title: task.text, tag: `Due ${task.time}`, tone: 'task' },
      });
    } else {
      anytime.push({ kind: 'task', id: task.id, task, title: task.text, tag: 'Anytime', tone: 'task' });
    }
  }

  timed.sort((a, b) => a.time.localeCompare(b.time));
  return [...timed.map((t) => t.item), ...anytime];
}

export interface DoneItem {
  kind: 'set' | 'task';
  id: string;
  title: string;
  time: string | null; // null for older data saved before timestamps existed
  at: number;
}

// What got done today, oldest first: every set logged and every task checked off.
// Entries and tasks saved before timestamps existed have no time; they sort first
// and are shown without one (a done task with no timestamp only counts if it was
// dated today, since there's no way to tell when else it was finished).
export function doneToday(state: CoachState, todayKey: string): DoneItem[] {
  const goals = new Map(state.goals.map((g) => [g.id, g]));
  const items: DoneItem[] = [];

  for (const e of state.entries) {
    if (e.date !== todayKey) continue;
    const goal = goals.get(e.goalId);
    const unit = goal?.unit ? ` ${goal.unit}` : '';
    items.push({
      kind: 'set',
      id: e.id,
      title: `${goal ? goalActivityName(goal.title) : 'Progress'} · ${e.value}${unit}`,
      time: e.loggedAt > 0 ? formatTime(e.loggedAt) : null,
      at: e.loggedAt,
    });
  }

  for (const t of state.tasks) {
    if (!t.done) continue;
    const today = t.completedAt !== null ? dayKey(new Date(t.completedAt)) === todayKey : t.date === todayKey;
    if (!today) continue;
    items.push({
      kind: 'task',
      id: t.id,
      title: t.text,
      time: t.completedAt !== null ? formatTime(t.completedAt) : null,
      at: t.completedAt ?? 0,
    });
  }

  return items.sort((a, b) => a.at - b.at);
}
