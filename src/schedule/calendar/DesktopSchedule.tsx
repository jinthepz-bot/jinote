import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  addDays,
  daysBetween,
  daysInMonth,
  formatDayKey,
  makeDayKey,
  MONTH_NAMES,
  MONTHS_SHORT,
  parseDayKey,
  startOfWeek,
  weekdayIndex,
} from '../../coach/days';
import { addTask, deleteTask, getCoachState, restoreTask, toggleTask, updateTask, useCoach } from '../../coach/store';
import { useTodayKey } from '../../coach/useTodayKey';
import { useAccent } from '../../design/accent';
import { useType } from '../../design/fonts';
import { hoverFill } from '../../design/hover';
import { colors, radius, spacing } from '../../design/theme';
import { TaskForm } from '../../home/TaskForm';
import {
  COACH_PANEL_COLLAPSED_WIDTH,
  COACH_PANEL_WIDTH,
  RIGHT_SHEET_WIDTH,
  useCoachPanelCollapsed,
  useMainWidth,
} from '../../navigation/layout';
import { RightSheet } from '../../navigation/RightSheet';
import { describeEventTime, describeWeekdays } from '../format';
import { occurrencesOn, occursOn } from '../occurrences';
import {
  addEvent,
  deleteEvent,
  editSeries,
  restoreEvent,
  retimeEvent,
  setOccurrenceChange,
  skipOccurrence,
  OCCURRENCE_DETAILS,
  updateEvent,
  useSchedule,
  type ScheduleEvent,
} from '../store';
import { minutesOf, timeFromMinutes } from '../time';
import { CalendarToolbar, type ToolbarView } from './CalendarToolbar';
import { draftAsEvent, EventSheet, type EventDraft, type OccurrenceSave } from './EventSheet';
import type { SeriesScope } from './SeriesChoiceCard';
import type { BlockAction, DropResult, RetimeScope } from './gridInteractions';
import { itemsOnDay, type CalendarItem } from './items';
import { MonthView } from './MonthView';
import { TimeGrid } from './TimeGrid';
import {
  goToDay,
  setAnchor,
  setMode,
  setWeekWhenNarrow,
  setZoom,
  THREE_DAYS,
  useCalendarSpan,
  useCalendarView,
} from './viewStore';

// With the side sheet open, the calendar keeps at least this much width beside it;
// on a window too small for that, the sheet covers the calendar's right edge instead.
const MIN_CALENDAR_BESIDE_SHEET = 480;

// Shifts a day key by whole months, clamping the day of the month (31 Jan -> 28 Feb).
function addMonths(key: string, delta: number): string {
  const p = parseDayKey(key)!;
  const index = p.year * 12 + (p.month - 1) + delta;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return makeDayKey(year, month, Math.min(p.day, daysInMonth(year, month)));
}

const monthTitle = (key: string) => {
  const p = parseDayKey(key)!;
  return `${MONTH_NAMES[p.month - 1]} ${p.year}`;
};

// "September 2026", or "Sep – Oct 2026" for a week that straddles two (short names,
// so it fits beside the toolbar's controls without being cut off).
function rangeTitle(days: string[]): string {
  const first = parseDayKey(days[0])!;
  const last = parseDayKey(days[days.length - 1])!;
  if (first.month === last.month && first.year === last.year) return monthTitle(days[0]);
  const firstName = MONTHS_SHORT[first.month - 1];
  const lastName = MONTHS_SHORT[last.month - 1];
  return first.year === last.year
    ? `${firstName} – ${lastName} ${last.year}`
    : `${firstName} ${first.year} – ${lastName} ${last.year}`;
}

// The whole weeks (Monday first) covering the month that `anchor` is in.
function monthWeeks(anchor: string): string[][] {
  const p = parseDayKey(anchor)!;
  const first = makeDayKey(p.year, p.month, 1);
  const last = makeDayKey(p.year, p.month, daysInMonth(p.year, p.month));
  const weeks: string[][] = [];
  for (let day = startOfWeek(first); day <= startOfWeek(last); day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
  }
  return weeks;
}

// The dashed stand-in for an event that's still being created in the side sheet.
function ghostItem(event: ScheduleEvent, date: string): CalendarItem {
  return {
    id: `ghost:${date}`,
    kind: 'event',
    title: event.title,
    date,
    start: minutesOf(event.startTime),
    end: event.endTime ? minutesOf(event.endTime) : null,
    timeLabel: describeEventTime(event),
    done: false,
    source: { kind: 'event', event, occurrenceDate: date },
  };
}

const TOAST_MS = 5000;

interface Toast {
  key: number;
  message: string;
  undo: () => void;
}

const endOfMonth = (day: string) => {
  const p = parseDayKey(day)!;
  return makeDayKey(p.year, p.month, daysInMonth(p.year, p.month));
};

type SheetState =
  | { mode: 'new'; key: number; date: string; startTime?: string }
  // `date` is the day the clicked occurrence is on; `occurrenceDate` the day its series
  // put it on (they differ when it was moved on its own).
  | { mode: 'edit'; key: number; eventId: string; date: string; occurrenceDate: string };

// The desktop Schedule (window width >= 720; see navigation/layout.ts): a calendar over the same events,
// tasks, goal deadlines and logged sessions the phone screen shows as lists.
export function DesktopSchedule() {
  const schedule = useSchedule();
  const coach = useCoach();
  const todayKey = useTodayKey();
  const { anchor, mode, filters, zoom, loaded: viewLoaded } = useCalendarView();
  const focused = useIsFocused();
  const panelCollapsed = useCoachPanelCollapsed();
  const mainWidth = useMainWidth();
  const { narrow, threeDay } = useCalendarSpan(mode);
  // Events are created and edited in a sheet on the right (see EventSheet); tasks
  // keep their existing dialog.
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [moveTo, setMoveTo] = useState<{ date: string; startTime: string; n: number } | undefined>();
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const draftDate = useRef<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  const showToast = (message: string, undo: () => void) => setToast({ key: Date.now(), message, undo });

  const closeSheet = () => {
    setSheet(null);
    setDraft(null);
    setMoveTo(undefined);
    draftDate.current = null;
  };

  // Leaving Schedule closes the sheet rather than leaving it over another screen.
  useEffect(() => {
    if (!focused) closeSheet();
  }, [focused]);

  // viewLoaded too, so a saved Month view doesn't flash a week first.
  if (!schedule.loaded || !coach.loaded || !viewLoaded) return <View style={styles.root} />;

  const data = { events: schedule.state.events, coach: coach.state };
  const itemsFor = (date: string) => itemsOnDay(data, date, filters);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
  const days =
    mode === 'day'
      ? [anchor]
      : threeDay
        ? Array.from({ length: THREE_DAYS }, (_, i) => addDays(anchor, i))
        : weekDays;
  const view: ToolbarView = threeDay ? '3day' : mode;
  const weeks = mode === 'month' ? monthWeeks(anchor) : [];

  const step = (delta: number) => {
    if (mode === 'day') setAnchor(addDays(anchor, delta));
    else if (threeDay) setAnchor(addDays(anchor, delta * THREE_DAYS));
    else if (mode === 'week') setAnchor(addDays(anchor, delta * 7));
    else setAnchor(addMonths(anchor, delta));
  };

  const openItem = (item: CalendarItem) => {
    if (item.source.kind === 'event') {
      const { event, occurrenceDate } = item.source;
      closeSheet();
      setSheet({ mode: 'edit', key: Date.now(), eventId: event.id, date: item.date, occurrenceDate });
    } else if (item.source.kind === 'task') {
      closeSheet();
      setEditingTaskId(item.source.task.id);
    }
    // Sessions and deadlines have no form of their own — a logged set is edited from
    // Goals, a deadline from the goal's deadline picker.
  };

  // An empty slot starts a new event there — or, while one is already being created,
  // moves that draft to the slot instead of throwing it away.
  const onSlotPress = (date: string, startTime: string) => {
    if (sheet?.mode === 'new') {
      setMoveTo({ date, startTime, n: Date.now() });
      return;
    }
    closeSheet();
    setSheet({ mode: 'new', key: Date.now(), date, startTime });
  };

  // When the sheet's date is changed to a day that's off screen, bring the calendar
  // there so the dashed block stays in view. Only a change counts: opening an event
  // that started months ago mustn't jump the calendar back to then.
  const onDraftChange = (next: EventDraft) => {
    setDraft(next);
    const previous = draftDate.current;
    draftDate.current = next.date;
    if (previous !== null && previous !== next.date && !days.includes(next.date)) setAnchor(next.date);
  };

  // A block was dragged or resized and let go: write it, once, now.
  const onDrop = ({ item, date, start, end }: DropResult, scope: RetimeScope) => {
    const startTime = timeFromMinutes(start);
    const endTime = end === null ? null : timeFromMinutes(end);
    if (item.source.kind === 'task') {
      const { task } = item.source;
      updateTask(task.id, { text: task.text, date, time: startTime });
      return;
    }
    if (item.source.kind !== 'event') return;
    const { event, occurrenceDate } = item.source;
    // An open edit sheet for this event would now show stale times.
    if (sheet?.mode === 'edit' && sheet.eventId === event.id) closeSheet();
    if (scope === 'one') {
      setOccurrenceChange(event.id, occurrenceDate, { date, startTime, endTime });
    } else {
      // A series moves relative to where the rule put this occurrence, so dragging a
      // day-changed occurrence shifts the series by where it ends up.
      const from = event.type === 'recurring' ? occurrenceDate : item.date;
      retimeEvent(event.id, { from, to: date, startTime, endTime, originalDate: occurrenceDate });
    }
  };

  // The round tick-box on a task: the same toggleTask Today uses, so completedAt and
  // "Done today" stay right. The store updates in memory at once (every view that
  // shows the task re-renders) and writes to storage in the background.
  const onToggleTask = (item: CalendarItem) => {
    if (item.source.kind === 'task') toggleTask(item.source.task.id);
  };

  // The block menu. Each action keeps what it replaced, so Undo puts exactly that back.
  const onBlockAction = (item: CalendarItem, action: BlockAction, date?: string) => {
    if (item.source.kind === 'task') {
      const { task } = item.source;
      if (action === 'duplicate' && date) {
        const copy = addTask(task.text, date, task.time);
        if (!copy) return;
        if (!days.includes(date)) setAnchor(date);
        showToast(`Duplicated to ${formatDayKey(date, todayKey)}`, () => deleteTask(copy.id));
      } else if (action === 'delete') {
        const index = getCoachState().tasks.findIndex((t) => t.id === task.id);
        deleteTask(task.id);
        showToast(`Deleted "${task.text}"`, () => restoreTask(task, index));
      }
      return;
    }
    if (item.source.kind !== 'event') return;
    const occurrence = item.source.event;

    // The series itself, not this occurrence's (possibly changed) copy.
    const before = schedule.state.events.find((e) => e.id === occurrence.id);
    if (!before) return;
    const undo = () => restoreEvent(before);

    if (action === 'deleteOccurrence') {
      if (sheet?.mode === 'edit' && sheet.eventId === before.id) closeSheet();
      skipOccurrence(before.id, item.source.occurrenceDate);
      showToast(`Deleted "${occurrence.title}" on ${formatDayKey(item.date, todayKey)}`, undo);
      return;
    }

    if (action === 'delete') {
      if (sheet?.mode === 'edit' && sheet.eventId === before.id) closeSheet();
      deleteEvent(before.id);
      showToast(before.type === 'recurring' ? `Deleted series "${before.title}"` : `Deleted "${before.title}"`, undo);
      return;
    }

    if (action === 'duplicate' && date) {
      // A copy of this occurrence, as a one-off on the chosen day.
      const copy = addEvent({
        title: occurrence.title,
        type: 'one-off',
        days: [],
        date,
        startDate: null,
        endDate: null,
        startTime: occurrence.startTime,
        endTime: occurrence.endTime,
        color: occurrence.color,
        location: occurrence.location,
        note: occurrence.note,
        reminderMinutesBefore: occurrence.reminderMinutesBefore,
      });
      if (!copy) return;
      if (!days.includes(date)) setAnchor(date);
      showToast(`Duplicated to ${formatDayKey(date, todayKey)}`, () => deleteEvent(copy.id));
      return;
    }

    // The three repeat actions. A one-off starts repeating from its own day; a series
    // keeps its start and only changes the days it meets on.
    const weekday = weekdayIndex(item.date);
    const repeat =
      action === 'weekdays'
        ? { days: [1, 2, 3, 4, 5], endDate: before.type === 'recurring' ? before.endDate : null, message: 'Repeats on weekdays' }
        : action === 'daily'
          ? { days: [0, 1, 2, 3, 4, 5, 6], endDate: before.type === 'recurring' ? before.endDate : null, message: 'Repeats every day' }
          : {
              days: [weekday],
              endDate: endOfMonth(item.date),
              message: `Repeats every ${describeWeekdays([weekday])} until ${formatDayKey(endOfMonth(item.date), todayKey)}`,
            };
    if (sheet?.mode === 'edit' && sheet.eventId === before.id) closeSheet();
    updateEvent(before.id, {
      title: before.title,
      type: 'recurring',
      days: repeat.days,
      date: null,
      startDate: before.type === 'recurring' ? before.startDate : before.date,
      endDate: repeat.endDate,
      startTime: before.startTime,
      endTime: before.endTime,
      color: before.color,
      location: before.location,
      note: before.note,
      reminderMinutesBefore: before.reminderMinutesBefore,
    });
    showToast(repeat.message, undo);
  };

  // The sheet's answers for one occurrence of a series.
  const onSaveOccurrence = (save: OccurrenceSave, scope: SeriesScope) => {
    if (sheet?.mode !== 'edit') return;
    const base = schedule.state.events.find((e) => e.id === sheet.eventId);
    if (!base) return;
    if (scope === 'one') {
      // Its own details only where they differ from the series; the rest fall back.
      const own = Object.fromEntries(
        OCCURRENCE_DETAILS.map((k) => [k, save.details[k] !== base[k] ? save.details[k] : undefined]),
      );
      setOccurrenceChange(base.id, sheet.occurrenceDate, {
        date: save.date,
        startTime: save.startTime,
        endTime: save.endTime,
        ...own,
      });
    } else {
      editSeries(base.id, {
        occurrence: sheet.occurrenceDate,
        // Moving the series, like dragging it, counts from the day its rule put this one.
        shiftDays: save.changed.date ? daysBetween(sheet.occurrenceDate, save.date) : 0,
        times: save.changed.times ? { startTime: save.startTime, endTime: save.endTime } : undefined,
        details: Object.fromEntries(save.changed.details.map((k) => [k, save.details[k]])),
        days: save.changed.repeat ? save.days : undefined,
        endDate: save.changed.repeat ? save.until : undefined,
      });
    }
    closeSheet();
  };

  const onDeleteOccurrence = (scope: SeriesScope) => {
    if (sheet?.mode !== 'edit') return;
    const base = schedule.state.events.find((e) => e.id === sheet.eventId);
    if (!base) return;
    const { occurrenceDate, date } = sheet;
    closeSheet();
    if (scope === 'one') {
      skipOccurrence(base.id, occurrenceDate);
      showToast(`Deleted "${base.title}" on ${formatDayKey(date, todayKey)}`, () => restoreEvent(base));
    } else {
      deleteEvent(base.id);
      showToast(`Deleted series "${base.title}"`, () => restoreEvent(base));
    }
  };

  const editingEvent =
    sheet?.mode === 'edit' ? (schedule.state.events.find((e) => e.id === sheet.eventId) ?? null) : null;
  const editingTask = coach.state.tasks.find((t) => t.id === editingTaskId) ?? null;

  // The sheet is wider than the coach panel it slides over, so it would cover the
  // calendar's right edge (or several columns, with the panel collapsed). While it's
  // open the calendar makes room for it instead of being partly hidden.
  const panelWidth = panelCollapsed ? COACH_PANEL_COLLAPSED_WIDTH : COACH_PANEL_WIDTH;
  const overlap = sheet ? Math.max(0, RIGHT_SHEET_WIDTH - panelWidth) : 0;
  const sheetOverlap = mainWidth - overlap >= MIN_CALENDAR_BESIDE_SHEET ? overlap : 0;

  // "3 days" and "Week" both mean the week mode; which one a narrow window shows is
  // remembered for the session (see useCalendarSpan).
  const changeView = (next: ToolbarView) => {
    if (next === '3day' || next === 'week') {
      if (narrow) setWeekWhenNarrow(next === 'week');
      setMode('week');
    } else setMode(next);
  };

  // The occurrence being edited, as it is on its day (with any one-day change).
  const sheetOccurrence = (() => {
    if (sheet?.mode !== 'edit') return undefined;
    const base = schedule.state.events.find((e) => e.id === sheet.eventId);
    if (!base || base.type !== 'recurring') return undefined;
    const found = occurrencesOn(base, sheet.date).find((o) => o.originalDate === sheet.occurrenceDate);
    return found ? { date: sheet.date, event: found.event, changed: sheet.occurrenceDate in base.exceptions } : undefined;
  })();

  const ghostEvent = sheet?.mode === 'new' && draft ? draftAsEvent(draft) : null;
  const ghostByDay = days.map((day) => (ghostEvent && occursOn(ghostEvent, day) ? ghostItem(ghostEvent, day) : null));

  return (
    <View style={[styles.root, { paddingRight: sheetOverlap }]}>
      <View style={styles.toolbar}>
        <CalendarToolbar
          title={mode === 'month' ? monthTitle(anchor) : rangeTitle(days)}
          mode={view}
          onModeChange={changeView}
          narrow={narrow}
          onToday={() => setAnchor(todayKey)}
          onPrevious={() => step(-1)}
          onNext={() => step(1)}
          onNewEvent={() => {
            closeSheet();
            setSheet({ mode: 'new', key: Date.now(), date: anchor });
          }}
          onNewTask={() => {
            closeSheet();
            setCreatingTask(true);
          }}
          zoom={mode === 'month' ? null : zoom}
          onZoomChange={setZoom}
          stepLabel={threeDay ? '3 days' : mode}
        />
      </View>

      <View style={styles.body}>
        {mode === 'month' ? (
          <MonthView
            weeks={weeks}
            month={parseDayKey(anchor)!.month}
            todayKey={todayKey}
            itemsFor={itemsFor}
            onItemPress={openItem}
            onToggleTask={onToggleTask}
            onDayPress={(date) => {
              goToDay(date);
              setMode('day');
            }}
          />
        ) : (
          <TimeGrid
            days={days}
            todayKey={todayKey}
            selectedDate={anchor}
            itemsByDay={days.map(itemsFor)}
            zoom={zoom}
            onZoomChange={setZoom}
            onItemPress={openItem}
            onSlotPress={onSlotPress}
            ghostByDay={ghostByDay}
            onDrop={onDrop}
            onToggleTask={onToggleTask}
            onBlockAction={onBlockAction}
            onDayPress={(date) => {
              goToDay(date);
              setMode('day');
            }}
          />
        )}
      </View>

      {toast ? (
        <UndoToast
          key={toast.key}
          message={toast.message}
          onUndo={() => {
            toast.undo();
            setToast(null);
          }}
        />
      ) : null}

      {sheet && focused && (sheet.mode === 'new' || editingEvent) ? (
        <RightSheet>
          <EventSheet
            key={sheet.key}
            todayKey={todayKey}
            editing={editingEvent}
            date={sheet.date}
            startTime={sheet.mode === 'new' ? sheet.startTime : undefined}
            moveTo={sheet.mode === 'new' ? moveTo : undefined}
            onDraftChange={onDraftChange}
            onClose={closeSheet}
            onSave={(input) => {
              if (editingEvent) updateEvent(editingEvent.id, input);
              else addEvent(input);
              closeSheet();
            }}
            onDelete={
              editingEvent
                ? () => {
                    deleteEvent(editingEvent.id);
                    closeSheet();
                  }
                : undefined
            }
            occurrence={sheetOccurrence}
            onSaveOccurrence={onSaveOccurrence}
            onDeleteOccurrence={onDeleteOccurrence}
          />
        </RightSheet>
      ) : null}

      <TaskForm
        visible={creatingTask}
        todayKey={todayKey}
        editing={null}
        initialDate={anchor}
        onCancel={() => setCreatingTask(false)}
        onSave={(input) => {
          addTask(input.text, input.date, input.time);
          setCreatingTask(false);
        }}
      />

      <TaskForm
        visible={editingTask !== null}
        todayKey={todayKey}
        editing={editingTask}
        onCancel={() => setEditingTaskId(null)}
        onSave={(input) => {
          if (editingTask) updateTask(editingTask.id, input);
          setEditingTaskId(null);
        }}
        onDelete={() => {
          if (editingTask) deleteTask(editingTask.id);
          setEditingTaskId(null);
        }}
      />
    </View>
  );
}

function UndoToast({ message, onUndo }: { message: string; onUndo: () => void }) {
  const type = useType();
  const accent = useAccent();
  return (
    <View style={styles.toastWrap}>
      <View style={styles.toast} accessibilityRole="alert">
        <Text style={[type.body, styles.toastText]} numberOfLines={1}>
          {message}
        </Text>
        <Pressable
          onPress={onUndo}
          accessibilityRole="button"
          accessibilityLabel="Undo"
          style={(state) => [styles.toastUndo, hoverFill(state)]}
        >
          <Text style={[type.bodyStrong, { color: accent.accent, fontSize: 14 }]}>Undo</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.xl,
    alignItems: 'center',
    zIndex: 50,
    pointerEvents: 'box-none',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    maxWidth: 460,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: colors.darkCard,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastText: { flexShrink: 1, color: colors.background, fontSize: 14 },
  toastUndo: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.control },
  toolbar: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
});
