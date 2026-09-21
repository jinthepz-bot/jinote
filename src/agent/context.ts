import { addDays, formatDayKey } from '../coach/days';
import { formatAmount } from '../coach/format';
import { currentStreak, deadlineStatus, goalProgress } from '../coach/stats';
import { entriesForGoal, getFeaturedGoal, type CoachState, type Goal, type LogEntry } from '../coach/store';
import { formatTime } from '../coach/days';
import type { Note } from '../notes/store';
import { describeEventTime } from '../schedule/format';
import { eventsOnDay } from '../schedule/occurrences';
import type { ScheduleEvent } from '../schedule/store';

// Keep the state summary small: it is rebuilt and sent on every message.
const MAX_TASKS = 15;
const MAX_BUY_ITEMS = 15;
const MAX_RECENT_NOTES = 5;
const MAX_NOTE_CHARS = 200;

function describeDeadline(goal: Goal, todayKey: string): string {
  const status = deadlineStatus(goal.deadline, todayKey);
  if (status.kind === 'unset' || !goal.deadline) return 'no deadline';
  const date = formatDayKey(goal.deadline, todayKey);
  if (status.kind === 'upcoming') {
    return `deadline ${date}, ${status.daysLeft} ${status.daysLeft === 1 ? 'day' : 'days'} left`;
  }
  return `deadline ${date}, ${status.daysOver} ${status.daysOver === 1 ? 'day' : 'days'} overdue`;
}

function describeGoal(goal: Goal, todayKey: string): string {
  const { percent, done } = goalProgress(goal);
  const unit = goal.unit ? ` ${goal.unit}` : '';
  const kind = goal.type === 'best' ? 'best result' : 'cumulative';
  return (
    `- "${goal.title}" (id: ${goal.id}, ${kind}): ${formatAmount(goal.current)} / ${formatAmount(goal.target)}${unit}` +
    ` (${percent}%${done ? ', reached' : ''}), ${describeDeadline(goal, todayKey)}`
  );
}

// For a best-result goal, each entry is its own set today, so they're listed out —
// the model needs to see them to know "log 15 more" means a fourth set, not a
// replacement. A cumulative goal just gets today's running total.
function describeLoggedToday(goal: Goal, todayEntries: LogEntry[]): string {
  if (todayEntries.length === 0) return 'Nothing logged today yet.';
  const unit = goal.unit ? ` ${goal.unit}` : '';
  const total = todayEntries.reduce((sum, e) => sum + e.value, 0);
  if (goal.type !== 'best') {
    const note = todayEntries[0]?.note;
    return `Logged today: ${formatAmount(total)}${unit}${note ? ` (note: ${truncate(note, 80)})` : ''}.`;
  }
  const sets = todayEntries.map((e) => formatAmount(e.value)).join(', ');
  return `Logged today: ${todayEntries.length} ${todayEntries.length === 1 ? 'set' : 'sets'} — ${sets}` +
    ` (total ${formatAmount(total)}${unit}).`;
}

function describeTask(task: { id: string; text: string; date: string | null; time: string | null }, todayKey: string): string {
  const when = task.date ? `, due ${formatDayKey(task.date, todayKey)}${task.time ? ` ${task.time}` : ''}` : '';
  return `- "${truncate(task.text, 100)}" (id: ${task.id})${when}`;
}

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function describeScheduleEvent(event: ScheduleEvent): string {
  const location = event.location ? `, ${event.location}` : '';
  return `- "${event.title}" (id: ${event.id}): ${describeEventTime(event)}${location}`;
}

function describeNoteSummary(note: Note, todayKey: string): string {
  const day = formatDayKey(new Date(note.createdAt).toISOString().slice(0, 10), todayKey);
  const when = `${day} ${formatTime(note.createdAt)}`;
  if (note.type === 'quick') return `- ${when} (id: ${note.id}, quick): ${truncate(note.text, MAX_NOTE_CHARS)}`;
  if (note.type === 'checklist') {
    const done = note.items.filter((i) => i.done).length;
    return `- ${when} (id: ${note.id}, checklist): "${note.title}" (${done}/${note.items.length} done)`;
  }
  return `- ${when} (id: ${note.id}, recipe): "${note.title}" (${note.ingredients.length} ingredients, ${note.steps.length} steps)`;
}

// A snapshot of the user's data, sent as its own system block on each request so
// the coach never asks for something it can already see.
export function buildCoachContext(state: CoachState, notes: Note[], schedule: ScheduleEvent[], todayKey: string): string {
  const featured = getFeaturedGoal(state);
  const streak = currentStreak(entriesForGoal(state, featured.id), todayKey);
  const others = state.goals.filter((g) => !g.featured);
  const openTasks = state.tasks.filter((t) => !t.done);
  const unbought = state.toBuy.filter((b) => !b.bought);

  const lines = [
    `CURRENT STATE (today is ${formatDayKey(todayKey, todayKey)}, ${todayKey})`,
    '',
    'FEATURED GOAL (drives the Home screen):',
    describeGoal(featured, todayKey),
    `Current streak: ${streak} ${streak === 1 ? 'day' : 'days'}. ` +
      `Best ${featured.unit || 'result'} ever: ${formatAmount(featured.current)}.`,
  ];

  const todayEntries = entriesForGoal(state, featured.id).filter((e) => e.date === todayKey);
  lines.push(describeLoggedToday(featured, todayEntries));

  const tomorrowKey = addDays(todayKey, 1);
  const todaySchedule = eventsOnDay(schedule, todayKey);
  const tomorrowSchedule = eventsOnDay(schedule, tomorrowKey);
  lines.push('', `TODAY'S SCHEDULE (${todaySchedule.length}):`);
  lines.push(...(todaySchedule.length > 0 ? todaySchedule.map(describeScheduleEvent) : ['- nothing scheduled']));
  lines.push('', `TOMORROW'S SCHEDULE (${tomorrowSchedule.length}):`);
  lines.push(...(tomorrowSchedule.length > 0 ? tomorrowSchedule.map(describeScheduleEvent) : ['- nothing scheduled']));

  lines.push('', `OTHER GOALS (${others.length}):`);
  lines.push(...(others.length > 0 ? others.map((g) => describeGoal(g, todayKey)) : ['- none']));

  lines.push('', `OPEN TASKS (${openTasks.length}):`);
  lines.push(
    ...(openTasks.length > 0
      ? openTasks.slice(0, MAX_TASKS).map((t) => describeTask(t, todayKey))
      : ['- none']),
  );

  lines.push('', `TO-BUY LIST (${unbought.length} unbought):`);
  lines.push(
    ...(unbought.length > 0
      ? unbought
          .slice(0, MAX_BUY_ITEMS)
          .map((b) => `- "${truncate(b.name, 80)}" (id: ${b.id})${b.price !== null ? `, price ${formatAmount(b.price)}` : ''}`)
      : ['- none']),
  );

  const recentNotes = notes.slice(0, MAX_RECENT_NOTES);
  lines.push('', `RECENT NOTES (${recentNotes.length} of ${notes.length}, newest first):`);
  lines.push(...(recentNotes.length > 0 ? recentNotes.map((n) => describeNoteSummary(n, todayKey)) : ['- none']));

  return lines.join('\n');
}
