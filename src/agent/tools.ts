import type Anthropic from '@anthropic-ai/sdk';

import { addDays, dayKey, daysBetween, formatDayKey, formatTime, isDayKey } from '../coach/days';
import { formatAmount, roundAmount } from '../coach/format';
import { goalProgress } from '../coach/stats';
import { dayTotal, GOAL_TYPE_LABELS, goalValue, setsOn } from '../coach/progress';
import {
  addBuyItem,
  addTask,
  createGoal,
  deleteEntry,
  deleteGoal,
  editGoal,
  getCoachState,
  getFeaturedGoal,
  logSets,
  setFeaturedGoal,
  toggleBought,
  toggleTask,
  updateEntry,
  type Goal,
  type GoalEdit,
} from '../coach/store';
import { moodOf } from '../journal/mood';
import { dailyEntriesBetween, getDailyState } from '../journal/store';
import { addChecklist, addQuickNote, addRecipe, getNotesState, searchNotes, type Note } from '../notes/store';
import { describeEventDays, describeEventTime } from '../schedule/format';
import { eventsOnDay } from '../schedule/occurrences';
import {
  addEvent,
  deleteEvent,
  getScheduleState,
  retimeEvent,
  setOccurrenceChange,
  type EventType,
  type ScheduleEvent,
} from '../schedule/store';
import { occurrencesOn } from '../schedule/occurrences';
import { isTimeKey, minutesOf, timeFromMinutes } from '../schedule/time';
import type { ActionRecord } from '../types';

const DAY_FORMAT = 'Local date "YYYY-MM-DD".';
const TIME_FORMAT = '24-hour "HH:MM", e.g. "10:15".';
const MAX_NOTE_RESULTS = 20;
const MAX_SCHEDULE_RESULTS = 20;
const MAX_JOURNAL_DAYS = 31;
const MAX_JOURNAL_ANSWER_CHARS = 300;

// A single line might be a natural comma-separated list ("flour, eggs, milk"),
// which is common for ingredients and checklist items but not for steps (whose
// sentences often contain their own commas), so only these two try the fallback.
function splitListSmart(raw: string): string[] {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  return lines.flatMap((l) => l.split(',').map((s) => s.trim()).filter(Boolean));
}

function splitLines(raw: string): string[] {
  return raw.split('\n').map((l) => l.trim()).filter(Boolean);
}

const WEEKDAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

// "mon,wed" or "Mon + Wed" -> [1, 3]. Unrecognized words are dropped rather than
// failing the whole call, since a good partial match beats a confusing rejection.
function parseWeekdays(raw: string): number[] {
  const days = raw
    .split(/[,+/&]|\s+and\s+|\s+/i)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => WEEKDAY_NAMES[s])
    .filter((n): n is number => n !== undefined);
  return [...new Set(days)].sort((a, b) => a - b);
}

// Every tool the coach can call, in a shape neutral to any provider: a flat set of
// string/number fields (no nesting), which is all nine tools need. `toAnthropicTools`
// and `toGeminiFunctionDeclarations` below turn this into each provider's own wire
// format; `executeCoachTool` (further down) runs a call from either one the same way.
type FieldType = 'string' | 'number';

interface ToolField {
  type: FieldType;
  description?: string;
  enum?: string[];
  // The field may be sent as an explicit null (e.g. to clear a deadline).
  nullable?: boolean;
}

export interface ToolSpec {
  name: string;
  description: string;
  properties: Record<string, ToolField>;
  required: string[];
}

export const COACH_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'log_progress',
    description:
      'Log sets the user says they did ("did 24 push-ups", "20, then 10, then 20" = three sets). Each number is ' +
      'one set, logged as its own entry for today — never add numbers up yourself or log a total as one set. ' +
      "One set counts toward both the goal's record (best single set, which only rises if a set beats it) and " +
      "today's total. If it isn't clear whether a number is one set, a total, or a target (\"add push up to 30\"), " +
      'ask instead of calling this.',
    properties: {
      goal_id: { type: 'string', description: 'Exact goal id from CURRENT STATE.' },
      sets: {
        type: 'string',
        description: 'The set sizes in the order done, comma-separated: "24" for one set, "20, 10, 20" for three.',
      },
      note: { type: 'string', description: "Optional short note in the user's words." },
    },
    required: ['goal_id', 'sets'],
  },
  {
    name: 'edit_set',
    description: "Change the size of one set logged today (\"that last set was 25, not 20\"). Set ids are in CURRENT STATE.",
    properties: {
      set_id: { type: 'string', description: 'Exact set id from CURRENT STATE.' },
      value: { type: 'number', description: 'The correct size of that one set.' },
    },
    required: ['set_id', 'value'],
  },
  {
    name: 'delete_set',
    description: 'Delete one logged set (logged by mistake). Set ids are in CURRENT STATE.',
    properties: { set_id: { type: 'string', description: 'Exact set id from CURRENT STATE.' } },
    required: ['set_id'],
  },
  {
    name: 'create_goal',
    description:
      'Create a new goal. Only when the user asks for one. Ask first if the target or the type is unclear.',
    properties: {
      title: { type: 'string', description: 'Short goal title, e.g. "100 push-ups".' },
      type: {
        type: 'string',
        enum: ['best', 'daily'],
        description:
          '"best" = best single set: a record, the most done in one go (100 push-ups in one unbroken set). ' +
          '"daily" = daily total: everything logged in a day adds up toward a target per day.',
      },
      target: { type: 'number', description: 'The record to reach ("best") or the amount per day ("daily").' },
      unit: { type: 'string', description: 'Optional unit, e.g. "reps", "km", "pages".' },
      deadline: { type: 'string', description: `Optional deadline. ${DAY_FORMAT}` },
      description: { type: 'string', description: "Optional one-line description in the user's words." },
    },
    required: ['title', 'type', 'target'],
  },
  {
    name: 'edit_goal',
    description:
      "Change a goal's name, type, target, unit, deadline or description. Pass only what changes. Logged sets are kept.",
    properties: {
      goal_id: { type: 'string', description: 'Exact goal id from CURRENT STATE.' },
      title: { type: 'string', description: 'New title.' },
      type: { type: 'string', enum: ['best', 'daily'], description: '"best" (best single set) or "daily" (daily total).' },
      target: { type: 'number', description: 'New target.' },
      unit: { type: 'string', description: 'New unit.' },
      deadline: { type: 'string', nullable: true, description: `New deadline. ${DAY_FORMAT} Use null to remove it.` },
      description: { type: 'string', description: 'New description.' },
    },
    required: ['goal_id'],
  },
  {
    name: 'delete_goal',
    description:
      'Delete a goal and its logged sets. Only when the user clearly asks. The featured goal can\'t be deleted: ' +
      'feature another goal first.',
    properties: { goal_id: { type: 'string', description: 'Exact goal id from CURRENT STATE.' } },
    required: ['goal_id'],
  },
  {
    name: 'set_featured_goal',
    description: 'Make a goal the featured one, shown on the Today screen.',
    properties: { goal_id: { type: 'string', description: 'Exact goal id from CURRENT STATE.' } },
    required: ['goal_id'],
  },
  {
    name: 'add_task',
    description:
      'Add a task to the user\'s list ("remind me to email my professor", "remind me to email my professor ' +
      'Friday at 2pm"). For things to do, not things to buy. If the user gives a day and/or time, resolve it to ' +
      'an absolute date/time yourself (today\'s date is in CURRENT STATE) and pass date and/or time so it shows ' +
      'on the Schedule; otherwise leave them out and it stays a plain task.',
    properties: {
      text: { type: 'string', description: "The task in the user's words." },
      date: { type: 'string', nullable: true, description: `Optional due date. ${DAY_FORMAT}` },
      time: {
        type: 'string',
        nullable: true,
        description: `Optional due time. ${TIME_FORMAT} Only used when date is also given.`,
      },
    },
    required: ['text'],
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done. Use the exact task id from CURRENT STATE.',
    properties: { task_id: { type: 'string' } },
    required: ['task_id'],
  },
  {
    name: 'add_buy_item',
    description: 'Add something the user wants to buy, with an optional price.',
    properties: {
      name: { type: 'string' },
      price: { type: 'number', description: 'Optional price as a number.' },
    },
    required: ['name'],
  },
  {
    name: 'mark_bought',
    description: 'Mark a to-buy item as bought. Use the exact item id from CURRENT STATE.',
    properties: { item_id: { type: 'string' } },
    required: ['item_id'],
  },
  {
    name: 'save_note',
    description:
      'Save a quick note or a checklist. For a quick note ("note down that...", "write down..."), use type ' +
      '"quick" and put the text in content. For a checklist ("make me a packing list"), use type "checklist", ' +
      'give it a title, and put the items in content, one per line. For a recipe, use save_recipe instead.',
    properties: {
      type: {
        type: 'string',
        enum: ['quick', 'checklist'],
        description: '"quick" for free text, "checklist" for a titled list of checkable items.',
      },
      title: { type: 'string', nullable: true, description: 'Required for a checklist. Not used for a quick note.' },
      content: {
        type: 'string',
        description: 'Quick note: the text, in the user\'s words. Checklist: the items, one per line.',
      },
    },
    required: ['type', 'content'],
  },
  {
    name: 'save_recipe',
    description: 'Save a recipe with its ingredients and steps. The user attaches a photo themselves, if any.',
    properties: {
      title: { type: 'string', description: 'Recipe title.' },
      ingredients: { type: 'string', description: 'Ingredients, one per line (or comma-separated).' },
      steps: { type: 'string', description: 'Steps in order, one per line.' },
      notes: {
        type: 'string',
        nullable: true,
        description: "Optional: cook time, servings, where it's from, or anything else worth remembering.",
      },
    },
    required: ['title', 'ingredients', 'steps'],
  },
  {
    name: 'search_notes',
    description:
      "Search the user's notes (quick notes, recipes, checklists) by title and content. Only needed to look " +
      'beyond the recent notes already in CURRENT STATE. Changes nothing.',
    properties: { query: { type: 'string', description: 'Search text.' } },
    required: ['query'],
  },
  {
    name: 'add_event',
    description:
      'Add a class, exam, appointment, or deadline to the schedule. For a recurring class use type "recurring" ' +
      'and day_of_week; for a single date (exam, appointment) use type "one-off" and date.',
    properties: {
      title: { type: 'string', description: 'Short event title.' },
      type: {
        type: 'string',
        enum: ['recurring', 'one-off'],
        description: '"recurring" for something that repeats weekly, "one-off" for a single date.',
      },
      day_of_week: {
        type: 'string',
        nullable: true,
        description:
          'Required when type is "recurring". Comma-separated weekday names it repeats on, e.g. "mon,wed".',
      },
      date: {
        type: 'string',
        nullable: true,
        description: `Required when type is "one-off". The event's date. ${DAY_FORMAT}`,
      },
      start_date: {
        type: 'string',
        nullable: true,
        description: `Optional, recurring only: when it starts repeating, e.g. a semester start. ${DAY_FORMAT}`,
      },
      end_date: {
        type: 'string',
        nullable: true,
        description: `Optional, recurring only: when it stops repeating, e.g. a semester end. ${DAY_FORMAT}`,
      },
      start_time: { type: 'string', description: `Start time. ${TIME_FORMAT}` },
      end_time: { type: 'string', nullable: true, description: `Optional end time. ${TIME_FORMAT}` },
      location: { type: 'string', nullable: true, description: 'Optional location.' },
      note: { type: 'string', nullable: true, description: 'Optional note.' },
    },
    required: ['title', 'type', 'start_time'],
  },
  {
    name: 'delete_event',
    description: 'Remove an event from the schedule. Use the exact event id from CURRENT STATE.',
    properties: { event_id: { type: 'string' } },
    required: ['event_id'],
  },
  {
    name: 'move_event',
    description:
      'Move or reschedule an event ("move my next event to 18:00", "push German to Thursday"). For a repeating ' +
      'event this changes one occurrence only: pass occurrence_date, the day that occurrence currently happens ' +
      '(from CURRENT STATE or get_schedule). Leave out whatever stays the same; a new start time without an end ' +
      'time keeps the same length.',
    properties: {
      event_id: { type: 'string', description: 'Exact event id from CURRENT STATE or get_schedule.' },
      occurrence_date: {
        type: 'string',
        nullable: true,
        description: `Required for a repeating event: the day the occurrence to move currently happens. ${DAY_FORMAT}`,
      },
      new_date: { type: 'string', nullable: true, description: `Optional new day. ${DAY_FORMAT}` },
      new_start_time: { type: 'string', nullable: true, description: `Optional new start. ${TIME_FORMAT}` },
      new_end_time: { type: 'string', nullable: true, description: `Optional new end. ${TIME_FORMAT}` },
    },
    required: ['event_id'],
  },
  {
    name: 'get_schedule',
    description:
      "Read the user's schedule for a range. Only needed to look further than what's already in CURRENT STATE " +
      '(which already has today and tomorrow). Changes nothing.',
    properties: {
      range: { type: 'string', enum: ['today', 'tomorrow', 'this_week'], description: 'Which range to read.' },
    },
    required: ['range'],
  },
  {
    name: 'get_journal',
    description:
      "Read the user's Daily journal for a range of days: each day's mood (1 Rough to 5 Great) and their answers to " +
      '"What went well?", "What got in the way?" and "Tomorrow\'s one thing". Use it for questions like "How was my ' +
      `week?" or to spot patterns. At most ${MAX_JOURNAL_DAYS} days. Changes nothing.`,
    properties: {
      from: { type: 'string', description: `First day. ${DAY_FORMAT}` },
      to: { type: 'string', description: `Last day, inclusive. ${DAY_FORMAT}` },
    },
    required: ['from', 'to'],
  },
];

export function toAnthropicTools(specs: ToolSpec[]): Anthropic.Beta.BetaTool[] {
  return specs.map((spec) => ({
    name: spec.name,
    description: spec.description,
    strict: true,
    input_schema: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(spec.properties).map(([key, field]) => [
          key,
          field.nullable
            ? { anyOf: [{ type: field.type }, { type: 'null' }], description: field.description }
            : { type: field.type, description: field.description, enum: field.enum },
        ]),
      ),
      required: spec.required,
      additionalProperties: false,
    },
  }));
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, { type: 'STRING' | 'NUMBER'; description?: string; enum?: string[]; nullable?: boolean }>;
    required: string[];
  };
}

const GEMINI_TYPE: Record<FieldType, 'STRING' | 'NUMBER'> = { string: 'STRING', number: 'NUMBER' };

// Gemini's Schema object has no `additionalProperties` and spells nullability as its
// own `nullable: true` flag rather than Anthropic's `anyOf: [type, "null"]`.
export function toGeminiFunctionDeclarations(specs: ToolSpec[]): GeminiFunctionDeclaration[] {
  return specs.map((spec) => ({
    name: spec.name,
    description: spec.description,
    parameters: {
      type: 'OBJECT',
      properties: Object.fromEntries(
        Object.entries(spec.properties).map(([key, field]) => [
          key,
          { type: GEMINI_TYPE[field.type], description: field.description, enum: field.enum, nullable: field.nullable },
        ]),
      ),
      required: spec.required,
    },
  }));
}

export interface ToolRun {
  content: string;
  isError?: boolean;
  action?: ActionRecord;
}

const fail = (content: string): ToolRun => ({ content, isError: true });
const ok = (result: unknown, action?: ActionRecord): ToolRun => ({ content: JSON.stringify(result), action });

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

const positiveNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? roundAmount(value) : null;

function findGoal(id: unknown): Goal | ToolRun {
  const goal = typeof id === 'string' ? getCoachState().goals.find((g) => g.id === id) : undefined;
  return goal ?? fail(`No goal has id "${String(id)}". Use an id from CURRENT STATE.`);
}

// What the goal looks like now, with its numbers named for what they are — the
// coach quotes these rather than working anything out itself.
function describeGoalResult(goal: Goal) {
  const state = getCoachState();
  const today = dayKey();
  const sets = setsOn(state, goal.id, today);
  const value = goalValue(goal, state, today);
  const { percent, done } = goalProgress(goal, value);
  return {
    id: goal.id,
    title: goal.title,
    type: GOAL_TYPE_LABELS[goal.type].toLowerCase(),
    target: goal.target,
    unit: goal.unit,
    ...(goal.type === 'best' ? { best_single_set: goal.current } : {}),
    ...(goal.type === 'cumulative' ? { running_total: goal.current } : {}),
    today_total: dayTotal(sets),
    today_sets: sets.map((e) => e.value),
    percent,
    reached: done,
    deadline: goal.deadline,
    featured: goal.featured,
  };
}

// "20, 10, 20", "20 10 20" or a plain number -> [20, 10, 20]; null if any part isn't
// a positive number.
function parseSets(raw: unknown): number[] | null {
  if (typeof raw === 'number') return positiveNumber(raw) === null ? null : [roundAmount(raw)];
  if (typeof raw !== 'string') return null;
  const parts = raw.split(/[,;\s+]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 20) return null;
  const values = parts.map((p) => Number(p));
  return values.every((v) => Number.isFinite(v) && v > 0) ? values.map(roundAmount) : null;
}

const goalType = (v: unknown): 'best' | 'daily' | null => (v === 'best' || v === 'daily' ? v : null);

// Runs one tool call from the coach against the local stores, regardless of which
// provider produced it. Input is checked here, so bad input comes back to the model
// as an error result instead of throwing.
export function executeCoachTool(name: string, rawInput: unknown): ToolRun {
  const input = (typeof rawInput === 'object' && rawInput !== null ? rawInput : {}) as Record<string, unknown>;

  switch (name) {
    case 'log_progress': {
      const goal = findGoal(input.goal_id);
      if ('content' in goal) return goal;
      const values = parseSets(input.sets ?? input.value);
      if (!values) return fail('sets must be one or more positive numbers, comma-separated, e.g. "20, 10, 20".');
      const result = logSets(goal.id, values, text(input.note) ?? '', dayKey());
      if (!result) return fail('Could not log those sets.');
      const updated = getCoachState().goals.find((g) => g.id === goal.id)!;
      const now = describeGoalResult(updated);
      const unit = goal.unit ? ` ${goal.unit}` : '';
      const list = values.map(formatAmount).join(', ');
      const what = values.length === 1 ? `${list}${unit}` : `${values.length} sets (${list})`;
      const record = result.isNewBest ? ` · new record ${formatAmount(result.current)}` : '';
      return ok(
        { logged_sets: values, is_new_record: result.isNewBest, goal: now },
        {
          kind: 'progress_logged',
          label: `Logged ${what} to "${goal.title}"${record}`,
          area: 'Goal',
          detail: `Logged ${what} · ${goal.title} · today ${formatAmount(now.today_total)}${record}`,
          undo: { kind: 'removeLogs', entryIds: result.entryIds, previousCurrent: result.previousCurrent },
        },
      );
    }

    case 'edit_set':
    case 'delete_set': {
      const entry = typeof input.set_id === 'string' ? getCoachState().entries.find((e) => e.id === input.set_id) : undefined;
      if (!entry) return fail(`No logged set has id "${String(input.set_id)}". Use a set id from CURRENT STATE.`);
      const goal = getCoachState().goals.find((g) => g.id === entry.goalId)!;
      const when = entry.loggedAt > 0 ? ` at ${formatTime(entry.loggedAt)}` : '';
      if (name === 'edit_set') {
        const value = positiveNumber(input.value);
        if (value === null) return fail('value must be a positive number.');
        const done = updateEntry(entry.id, value);
        if (!done) return fail('Could not change that set.');
        const now = describeGoalResult(getCoachState().goals.find((g) => g.id === goal.id)!);
        return ok(
          { changed_set: { id: entry.id, from: entry.value, to: value }, goal: now },
          {
            kind: 'set_edited',
            label: `Changed a set of "${goal.title}" from ${formatAmount(entry.value)} to ${formatAmount(value)}`,
            area: 'Goal',
            detail: `Set${when} ${formatAmount(entry.value)} → ${formatAmount(value)} · ${goal.title} · today ${formatAmount(now.today_total)}`,
            undo: { kind: 'restoreSet', entry: done.before, previousCurrent: done.previousCurrent },
          },
        );
      }
      const done = deleteEntry(entry.id);
      if (!done) return fail('Could not delete that set.');
      const now = describeGoalResult(getCoachState().goals.find((g) => g.id === goal.id)!);
      return ok(
        { deleted_set: { id: entry.id, value: entry.value, date: entry.date }, goal: now },
        {
          kind: 'set_deleted',
          label: `Deleted a set of ${formatAmount(entry.value)} from "${goal.title}"`,
          area: 'Goal',
          detail: `Deleted set${when} of ${formatAmount(entry.value)} · ${goal.title} · today ${formatAmount(now.today_total)}`,
          undo: { kind: 'restoreSet', entry: done.before, previousCurrent: done.previousCurrent },
        },
      );
    }

    case 'create_goal': {
      const title = text(input.title);
      const target = positiveNumber(input.target);
      const type = goalType(input.type);
      if (!title) return fail('title is required.');
      if (target === null) return fail('target must be a positive number.');
      if (!type) return fail('type must be "best" (best single set) or "daily" (daily total).');
      const rawDeadline = text(input.deadline);
      if (rawDeadline && !isDayKey(rawDeadline)) return fail(`deadline "${rawDeadline}" is not valid. ${DAY_FORMAT}`);
      const goal = createGoal({
        title,
        target,
        type,
        deadline: rawDeadline ?? null,
        description: text(input.description),
        unit: text(input.unit),
      });
      if (!goal) return fail('Could not create that goal.');
      return ok(
        { created: describeGoalResult(goal) },
        {
          kind: 'goal_created',
          label: `Created goal "${goal.title}"`,
          area: 'Goal',
          detail: `Created "${goal.title}" · ${GOAL_TYPE_LABELS[goal.type].toLowerCase()} · target ${formatAmount(goal.target)}`,
          undo: { kind: 'deleteGoal', id: goal.id },
        },
      );
    }

    case 'edit_goal': {
      const goal = findGoal(input.goal_id);
      if ('content' in goal) return goal;
      const edit: GoalEdit = {};
      const changes: string[] = [];
      if (input.title !== undefined) {
        const title = text(input.title);
        if (!title) return fail('title cannot be empty.');
        edit.title = title;
        changes.push(`name "${title}"`);
      }
      if (input.type !== undefined) {
        const type = goalType(input.type);
        if (!type) return fail('type must be "best" or "daily".');
        edit.type = type;
        changes.push(GOAL_TYPE_LABELS[type].toLowerCase());
      }
      if (input.target !== undefined) {
        const target = positiveNumber(input.target);
        if (target === null) return fail('target must be a positive number.');
        edit.target = target;
        changes.push(`target ${formatAmount(goal.target)} → ${formatAmount(target)}`);
      }
      if (input.unit !== undefined) {
        edit.unit = typeof input.unit === 'string' ? input.unit : '';
        changes.push(`unit "${edit.unit}"`);
      }
      if ('deadline' in input) {
        const raw = text(input.deadline);
        if (raw && !isDayKey(raw)) return fail(`deadline "${raw}" is not valid. ${DAY_FORMAT} Use null to clear it.`);
        edit.deadline = raw ?? null;
        changes.push(raw ? `deadline ${formatDayKey(raw)}` : 'no deadline');
      }
      if (input.description !== undefined) {
        edit.description = typeof input.description === 'string' ? input.description : '';
        changes.push('description');
      }
      if (changes.length === 0) return fail('Nothing to change: pass at least one field.');
      const before = editGoal(goal.id, edit);
      if (!before) return fail('Could not change that goal.');
      const updated = getCoachState().goals.find((g) => g.id === goal.id)!;
      return ok(
        { updated: describeGoalResult(updated) },
        {
          kind: 'goal_edited',
          label: `Changed "${goal.title}": ${changes.join(', ')}`,
          area: 'Goal',
          detail: `${goal.title} · ${changes.join(', ')}`,
          undo: { kind: 'restoreGoalDetails', goal: before },
        },
      );
    }

    case 'delete_goal': {
      const goal = findGoal(input.goal_id);
      if ('content' in goal) return goal;
      if (goal.featured) return fail("That's the featured goal, which can't be deleted. Feature another goal first.");
      const removed = deleteGoal(goal.id);
      if (!removed) return fail('Could not delete that goal.');
      return ok(
        { deleted: { id: goal.id, title: goal.title, sets_removed: removed.entries.length } },
        {
          kind: 'goal_deleted',
          label: `Deleted goal "${goal.title}"`,
          area: 'Goal',
          detail: `Deleted "${goal.title}" and its ${removed.entries.length} ${removed.entries.length === 1 ? 'set' : 'sets'}`,
          undo: { kind: 'restoreGoal', goal: removed.goal, entries: removed.entries, index: removed.index },
        },
      );
    }

    case 'set_featured_goal': {
      const goal = findGoal(input.goal_id);
      if ('content' in goal) return goal;
      const previous = getFeaturedGoal(getCoachState());
      if (previous.id === goal.id) return ok({ featured: describeGoalResult(goal), unchanged: true });
      setFeaturedGoal(goal.id);
      return ok(
        { featured: describeGoalResult(goal), previously_featured: previous.title },
        {
          kind: 'goal_featured',
          label: `Featured "${goal.title}" on Today`,
          area: 'Goal',
          detail: `"${goal.title}" is now on Today (was "${previous.title}")`,
          undo: { kind: 'setFeatured', goalId: previous.id },
        },
      );
    }

    case 'add_task': {
      const value = text(input.text);
      if (!value) return fail('text is required.');

      const rawDate = text(input.date);
      if (rawDate && !isDayKey(rawDate)) return fail(`date "${rawDate}" is not valid. ${DAY_FORMAT}`);
      const rawTime = text(input.time);
      if (rawTime && !isTimeKey(rawTime)) return fail(`time "${rawTime}" is not valid. ${TIME_FORMAT}`);

      const date = rawDate ?? null;
      const time = date ? (rawTime ?? null) : null;
      const task = addTask(value, date, time);
      if (!task) return fail('Could not add that task.');
      const when = task.date ? ` for ${formatDayKey(task.date)}${task.time ? ` at ${task.time}` : ''}` : '';
      return ok(
        { added: { id: task.id, text: task.text, date: task.date, time: task.time } },
        {
          kind: 'task_added',
          label: `Added task "${task.text}"${when}`,
          area: 'Task',
          detail: `Added ${task.text}${task.date ? `, ${formatDayKey(task.date)}${task.time ? ` ${task.time}` : ''}` : ''}`,
          undo: { kind: 'deleteTask', id: task.id },
        },
      );
    }

    case 'complete_task': {
      const id = text(input.task_id);
      const task = getCoachState().tasks.find((t) => t.id === id);
      if (!task) return fail(`No task has id "${String(input.task_id)}". Use an id from CURRENT STATE.`);
      if (task.done) return ok({ already_done: { id: task.id, text: task.text } });
      toggleTask(task.id);
      return ok(
        { completed: { id: task.id, text: task.text } },
        {
          kind: 'task_completed',
          label: `Completed "${task.text}"`,
          area: 'Task',
          detail: `Done · ${task.text}`,
          undo: { kind: 'reopenTask', id: task.id },
        },
      );
    }

    case 'add_buy_item': {
      const name_ = text(input.name);
      if (!name_) return fail('name is required.');
      const price = input.price === undefined || input.price === null ? null : positiveNumber(input.price);
      if (input.price !== undefined && input.price !== null && price === null) {
        return fail('price must be a positive number.');
      }
      addBuyItem(name_, price);
      const item = getCoachState().toBuy.at(-1)!;
      return ok(
        { added: { id: item.id, name: item.name, price: item.price } },
        {
          kind: 'buy_added',
          label: `Added "${item.name}" to buy${item.price !== null ? ` · ${formatAmount(item.price)}` : ''}`,
          area: 'To-buy',
          detail: `Added ${item.name}${item.price !== null ? ` · ${formatAmount(item.price)}` : ''}`,
          undo: { kind: 'deleteBuyItem', id: item.id },
        },
      );
    }

    case 'mark_bought': {
      const id = text(input.item_id);
      const item = getCoachState().toBuy.find((b) => b.id === id);
      if (!item) return fail(`No to-buy item has id "${String(input.item_id)}". Use an id from CURRENT STATE.`);
      if (item.bought) return ok({ already_bought: { id: item.id, name: item.name } });
      toggleBought(item.id);
      return ok(
        { bought: { id: item.id, name: item.name } },
        {
          kind: 'buy_bought',
          label: `Marked "${item.name}" as bought`,
          area: 'To-buy',
          detail: `Bought · ${item.name}`,
          undo: { kind: 'unbuy', id: item.id },
        },
      );
    }

    case 'save_note': {
      const content = text(input.content);
      if (!content) return fail('content is required.');

      if (input.type === 'checklist') {
        const title = text(input.title);
        if (!title) return fail('title is required for a checklist.');
        const note = addChecklist(title, splitListSmart(content));
        if (!note) return fail('Could not save that checklist.');
        return ok(
          { saved: { id: note.id, title: note.title, item_count: note.items.length } },
          {
            kind: 'note_saved',
            label: `Saved checklist "${note.title}"`,
            area: 'Journal',
            detail: `Checklist "${note.title}" · ${note.items.length} ${note.items.length === 1 ? 'item' : 'items'}`,
            undo: { kind: 'deleteNote', id: note.id },
          },
        );
      }
      if (input.type !== 'quick') return fail('type must be "quick" or "checklist".');
      const note = addQuickNote(content);
      if (!note) return fail('Could not save that note.');
      return ok(
        { saved: { id: note.id, saved_at: `${formatDayKey(dayKey(new Date(note.createdAt)))} ${formatTime(note.createdAt)}` } },
        {
          kind: 'note_saved',
          label: `Saved note: "${truncateLabel(content)}"`,
          area: 'Journal',
          detail: `Quick note · ${truncateLabel(content)}`,
          undo: { kind: 'deleteNote', id: note.id },
        },
      );
    }

    case 'save_recipe': {
      const title = text(input.title);
      if (!title) return fail('title is required.');
      const ingredientsRaw = text(input.ingredients);
      if (!ingredientsRaw) return fail('ingredients is required.');
      const stepsRaw = text(input.steps);
      if (!stepsRaw) return fail('steps is required.');
      const recipe = addRecipe({
        title,
        photoUri: null,
        cookTime: '',
        category: 'Main dish',
        rating: 1,
        ingredients: splitListSmart(ingredientsRaw),
        steps: splitLines(stepsRaw),
        notes: text(input.notes) ?? '',
      });
      if (!recipe) return fail('Could not save that recipe.');
      return ok(
        {
          saved: {
            id: recipe.id,
            title: recipe.title,
            ingredient_count: recipe.ingredients.length,
            step_count: recipe.steps.length,
          },
        },
        {
          kind: 'recipe_saved',
          label: `Saved recipe "${recipe.title}"`,
          area: 'Journal',
          detail: `Recipe "${recipe.title}"`,
          undo: { kind: 'deleteNote', id: recipe.id },
        },
      );
    }

    case 'search_notes': {
      const query = text(input.query);
      if (!query) return fail('query is required.');
      const results = searchNotes(getNotesState().notes, query)
        .slice(0, MAX_NOTE_RESULTS)
        .map(describeNoteResult);
      return ok({ query, count: results.length, notes: results });
    }

    case 'add_event': {
      const title = text(input.title);
      if (!title) return fail('title is required.');
      const type: EventType | null = input.type === 'recurring' || input.type === 'one-off' ? input.type : null;
      if (!type) return fail('type must be "recurring" or "one-off".');

      const startTime = text(input.start_time);
      if (!startTime || !isTimeKey(startTime)) {
        return fail(`start_time "${String(input.start_time)}" is not valid. ${TIME_FORMAT}`);
      }
      const endTime = text(input.end_time);
      if (endTime && !isTimeKey(endTime)) return fail(`end_time "${endTime}" is not valid. ${TIME_FORMAT}`);

      let days: number[] = [];
      let date: string | null = null;
      let startDate: string | null = null;
      let endDate: string | null = null;

      if (type === 'recurring') {
        const raw = text(input.day_of_week);
        if (!raw) return fail('day_of_week is required for a recurring event, e.g. "mon,wed".');
        days = parseWeekdays(raw);
        if (days.length === 0) return fail(`day_of_week "${raw}" could not be understood. Use names like "mon,wed".`);
        const rawStart = text(input.start_date);
        if (rawStart && !isDayKey(rawStart)) return fail(`start_date "${rawStart}" is not valid. ${DAY_FORMAT}`);
        const rawEnd = text(input.end_date);
        if (rawEnd && !isDayKey(rawEnd)) return fail(`end_date "${rawEnd}" is not valid. ${DAY_FORMAT}`);
        startDate = rawStart ?? null;
        endDate = rawEnd ?? null;
      } else {
        const rawDate = text(input.date);
        if (!rawDate || !isDayKey(rawDate)) {
          return fail(`date "${String(input.date)}" is not valid. ${DAY_FORMAT} Required for a one-off event.`);
        }
        date = rawDate;
      }

      const event = addEvent({
        title,
        type,
        days,
        date,
        startDate,
        endDate,
        startTime,
        endTime: endTime ?? null,
        location: text(input.location) ?? '',
        note: text(input.note) ?? '',
        color: 'accent',
        // Reminders are set manually per event, in Schedule — the coach doesn't set a lead time.
        reminderMinutesBefore: null,
      });
      if (!event) return fail('Could not create that event.');
      return ok(
        { created: describeEventResult(event) },
        {
          kind: 'event_added',
          label: `Added "${event.title}" to schedule`,
          area: 'Schedule',
          detail: `Added ${eventWhen(event)}`,
          undo: { kind: 'deleteEvent', id: event.id },
        },
      );
    }

    case 'delete_event': {
      const id = text(input.event_id);
      const event = getScheduleState().events.find((e) => e.id === id);
      if (!event) return fail(`No event has id "${String(input.event_id)}". Use an id from CURRENT STATE.`);
      deleteEvent(event.id);
      return ok(
        { deleted: { id: event.id, title: event.title } },
        {
          kind: 'event_deleted',
          label: `Removed "${event.title}" from schedule`,
          area: 'Schedule',
          detail: `Removed ${eventWhen(event)}`,
          undo: { kind: 'restoreEvent', event },
        },
      );
    }

    case 'move_event': {
      const id = text(input.event_id);
      const event = getScheduleState().events.find((e) => e.id === id);
      if (!event) return fail(`No event has id "${String(input.event_id)}". Use an id from CURRENT STATE.`);
      const newDate = text(input.new_date);
      if (newDate && !isDayKey(newDate)) return fail(`new_date "${newDate}" is not valid. ${DAY_FORMAT}`);
      const newStart = text(input.new_start_time);
      if (newStart && !isTimeKey(newStart)) return fail(`new_start_time "${newStart}" is not valid. ${TIME_FORMAT}`);
      const newEnd = text(input.new_end_time);
      if (newEnd && !isTimeKey(newEnd)) return fail(`new_end_time "${newEnd}" is not valid. ${TIME_FORMAT}`);
      if (!newDate && !newStart && !newEnd) return fail('Give at least one of new_date, new_start_time, new_end_time.');

      // Where it is now: the one-off itself, or the named occurrence of the series.
      let from: string;
      let current: ScheduleEvent;
      let originalDate: string | null = null;
      if (event.type === 'one-off') {
        from = event.date!;
        current = event;
      } else {
        const onDay = text(input.occurrence_date);
        if (!onDay || !isDayKey(onDay)) return fail(`occurrence_date is required for a repeating event. ${DAY_FORMAT}`);
        const occurrence = occurrencesOn(event, onDay)[0];
        if (!occurrence) return fail(`"${event.title}" doesn't happen on ${onDay}. Check get_schedule.`);
        from = onDay;
        current = occurrence.event;
        originalDate = occurrence.originalDate;
      }

      const to = newDate ?? from;
      const startTime = newStart ?? current.startTime;
      // A new start alone keeps the event's length.
      const endTime =
        newEnd ??
        (newStart && current.endTime
          ? timeFromMinutes(minutesOf(newStart) + minutesOf(current.endTime) - minutesOf(current.startTime))
          : current.endTime);
      if (endTime && minutesOf(endTime) <= minutesOf(startTime)) return fail('The end time must be after the start time.');

      if (originalDate) setOccurrenceChange(event.id, originalDate, { date: to, startTime, endTime });
      else retimeEvent(event.id, { from, to, startTime, endTime });

      const moved = { ...current, date: to, startTime, endTime };
      return ok(
        { moved: { id: event.id, title: event.title, date: to, time: describeEventTime(moved), only_this_occurrence: !!originalDate } },
        {
          kind: 'event_moved',
          label: `Moved "${event.title}" to ${formatDayKey(to)} ${startTime}`,
          area: 'Schedule',
          detail: `Moved ${event.title} → ${formatDayKey(to)} ${describeEventTime(moved)}${originalDate ? ' (this one only)' : ''}`,
          undo: { kind: 'restoreEvent', event },
        },
      );
    }

    case 'get_schedule': {
      const range = input.range;
      if (range !== 'today' && range !== 'tomorrow' && range !== 'this_week') {
        return fail('range must be "today", "tomorrow", or "this_week".');
      }
      const today = dayKey();
      const events = getScheduleState().events;
      if (range === 'this_week') {
        const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
        const results = days.flatMap((d) => eventsOnDay(events, d).map((e) => describeEventResult(e, d)));
        return ok({ range, count: results.length, events: results.slice(0, MAX_SCHEDULE_RESULTS) });
      }
      const day = range === 'today' ? today : addDays(today, 1);
      const results = eventsOnDay(events, day).map((e) => describeEventResult(e, day));
      return ok({ range, count: results.length, events: results });
    }

    case 'get_journal': {
      const { from, to } = input;
      if (!isDayKey(from) || !isDayKey(to)) return fail('from and to must be dates as "YYYY-MM-DD".');
      if (to < from) return fail('to must be on or after from.');
      if (daysBetween(from, to) >= MAX_JOURNAL_DAYS) return fail(`Ask for at most ${MAX_JOURNAL_DAYS} days at a time.`);
      const clipAnswer = (s: string) =>
        s.length > MAX_JOURNAL_ANSWER_CHARS ? `${s.slice(0, MAX_JOURNAL_ANSWER_CHARS - 1)}…` : s;
      const entries = dailyEntriesBetween(getDailyState(), from, to).map((e) => ({
        date: e.date,
        day: formatDayKey(e.date),
        mood: e.mood ? `${moodOf(e.mood).label} (${e.mood}/5)` : null,
        went_well: clipAnswer(e.wentWell.trim()),
        got_in_the_way: clipAnswer(e.gotInTheWay.trim()),
        tomorrow_focus: clipAnswer(e.tomorrowFocus.trim()),
      }));
      return ok({ from, to, days_in_range: daysBetween(from, to) + 1, days_written: entries.length, entries });
    }

    default:
      return fail(`Unknown tool "${name}".`);
  }
}

function describeNoteResult(note: Note) {
  if (note.type === 'quick') return { id: note.id, type: note.type, text: truncateLabel(note.text) };
  if (note.type === 'checklist') {
    return {
      id: note.id,
      type: note.type,
      title: note.title,
      items: note.items.length,
      done: note.items.filter((i) => i.done).length,
    };
  }
  return { id: note.id, type: note.type, title: note.title, ingredients: note.ingredients.length, steps: note.steps.length };
}

function describeEventResult(event: ScheduleEvent, onDay?: string) {
  return {
    id: event.id,
    title: event.title,
    type: event.type,
    when: onDay ? formatDayKey(onDay) : describeEventDays(event, dayKey()),
    date: onDay, // the day as "YYYY-MM-DD", for move_event's occurrence_date
    time: describeEventTime(event),
    location: event.location || undefined,
    note: event.note || undefined,
  };
}

// "Gym, Wed 30 Sep 19:00" or "German A2, Mon + Wed 09:30–11:00".
function eventWhen(event: ScheduleEvent): string {
  return `${event.title}, ${describeEventDays(event, dayKey())} ${describeEventTime(event)}`;
}

function truncateLabel(value: string): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 59)}…` : oneLine;
}
