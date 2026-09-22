import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { addDays, daysInMonth, makeDayKey, MONTH_NAMES, parseDayKey, startOfWeek } from '../../coach/days';
import { addTask, deleteTask, updateTask, useCoach } from '../../coach/store';
import { useTodayKey } from '../../coach/useTodayKey';
import { colors, spacing } from '../../design/theme';
import { TaskForm } from '../../home/TaskForm';
import { EventForm } from '../EventForm';
import { addEvent, deleteEvent, updateEvent, useSchedule } from '../store';
import { CalendarToolbar } from './CalendarToolbar';
import { itemsOnDay, type CalendarItem } from './items';
import { MonthView } from './MonthView';
import { TimeGrid } from './TimeGrid';
import { goToDay, setAnchor, setMode, setZoom, useCalendarView } from './viewStore';

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

// "September 2026", or "September – October 2026" for a week that straddles two.
function rangeTitle(days: string[]): string {
  const first = parseDayKey(days[0])!;
  const last = parseDayKey(days[days.length - 1])!;
  if (first.month === last.month && first.year === last.year) return monthTitle(days[0]);
  const firstName = MONTH_NAMES[first.month - 1];
  const lastName = MONTH_NAMES[last.month - 1];
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

// The desktop Schedule (window width >= 1024): a calendar over the same events,
// tasks, goal deadlines and logged sessions the phone screen shows as lists.
export function DesktopSchedule() {
  const schedule = useSchedule();
  const coach = useCoach();
  const todayKey = useTodayKey();
  const { anchor, mode, filters, zoom, loaded: viewLoaded } = useCalendarView();
  const [creating, setCreating] = useState<{ date: string; startTime?: string } | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  // viewLoaded too, so a saved Month view doesn't flash a week first.
  if (!schedule.loaded || !coach.loaded || !viewLoaded) return <View style={styles.root} />;

  const data = { events: schedule.state.events, coach: coach.state };
  const itemsFor = (date: string) => itemsOnDay(data, date, filters);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
  const days = mode === 'day' ? [anchor] : weekDays;
  const weeks = mode === 'month' ? monthWeeks(anchor) : [];

  const step = (delta: number) => {
    if (mode === 'day') setAnchor(addDays(anchor, delta));
    else if (mode === 'week') setAnchor(addDays(anchor, delta * 7));
    else setAnchor(addMonths(anchor, delta));
  };

  const openItem = (item: CalendarItem) => {
    if (item.source.kind === 'event') setEditingEventId(item.source.event.id);
    else if (item.source.kind === 'task') setEditingTaskId(item.source.task.id);
    // Sessions and deadlines have no form of their own — a logged set is edited from
    // Goals, a deadline from the goal's deadline picker.
  };

  const editingEvent = schedule.state.events.find((e) => e.id === editingEventId) ?? null;
  const editingTask = coach.state.tasks.find((t) => t.id === editingTaskId) ?? null;

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <CalendarToolbar
          title={mode === 'month' ? monthTitle(anchor) : rangeTitle(days)}
          mode={mode}
          onModeChange={setMode}
          onToday={() => setAnchor(todayKey)}
          onPrevious={() => step(-1)}
          onNext={() => step(1)}
          onNewEvent={() => setCreating({ date: anchor })}
          onNewTask={() => setCreatingTask(true)}
          zoom={mode === 'month' ? null : zoom}
          onZoomChange={setZoom}
          stepLabel={mode}
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
            onSlotPress={(date, startTime) => setCreating({ date, startTime })}
            onDayPress={(date) => {
              goToDay(date);
              setMode('day');
            }}
          />
        )}
      </View>

      <EventForm
        visible={creating !== null}
        todayKey={todayKey}
        editing={null}
        initial={creating ?? undefined}
        onCancel={() => setCreating(null)}
        onSave={(input) => {
          addEvent(input);
          setCreating(null);
        }}
      />

      <EventForm
        visible={editingEvent !== null}
        todayKey={todayKey}
        editing={editingEvent}
        onCancel={() => setEditingEventId(null)}
        onSave={(input) => {
          if (editingEvent) updateEvent(editingEvent.id, input);
          setEditingEventId(null);
        }}
        onDelete={() => {
          if (editingEvent) deleteEvent(editingEvent.id);
          setEditingEventId(null);
        }}
      />

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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  toolbar: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
});
