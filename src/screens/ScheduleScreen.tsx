import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addDays, formatDayKey, startOfWeek } from '../coach/days';
import { deleteTask, toggleTask, updateTask, useCoach } from '../coach/store';
import { useTodayKey } from '../coach/useTodayKey';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, radius, spacing } from '../design/theme';
import { AddAction, Card, ScreenTitle, Section } from '../design/ui';
import { SettingsButton } from './../navigation/SettingsHost';
import { TaskForm } from '../home/TaskForm';
import { EventForm } from '../schedule/EventForm';
import { upcomingOccurrences } from '../schedule/occurrences';
import { addEvent, deleteEvent, updateEvent, useSchedule } from '../schedule/store';
import { TaskRow } from '../schedule/TaskRow';
import { UpcomingRow } from '../schedule/UpcomingRow';
import { WeekGrid } from '../schedule/WeekGrid';

const UPCOMING_LIMIT = 8;

export function ScheduleScreen() {
  const type = useType();
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { state, loaded } = useSchedule();
  const coach = useCoach();
  const todayKey = useTodayKey();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayKey));
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  if (!loaded || !coach.loaded) return <View style={styles.root} />;

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const onCurrentWeek = weekStart === startOfWeek(todayKey);
  const editingEvent = state.events.find((e) => e.id === editingId) ?? null;
  const editingTask = coach.state.tasks.find((t) => t.id === editingTaskId) ?? null;
  const upcoming = upcomingOccurrences(state.events, todayKey, UPCOMING_LIMIT);
  const weekTasks = coach.state.tasks.filter((task) => task.date && task.date >= weekDays[0] && task.date <= weekDays[6]);
  const weekRange = `${formatDayKey(weekDays[0], todayKey)} – ${formatDayKey(weekDays[6], todayKey)}`;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenTitle
          label={`${state.events.length} ${state.events.length === 1 ? 'event' : 'events'} · ${formatDayKey(todayKey, todayKey)}`}
          title="SCHEDULE"
          action={<SettingsButton />}
        />

        <Section label="This week">
          <Card style={styles.weekCard}>
            <View style={styles.weekNav}>
              <Pressable
                onPress={() => setWeekStart((w) => addDays(w, -7))}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Previous week"
              >
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </Pressable>
              <Pressable onPress={() => setWeekStart(startOfWeek(todayKey))} disabled={onCurrentWeek} hitSlop={6}>
                <Text style={[type.mono, styles.weekRange, !onCurrentWeek && { color: accent.accent }]}>{weekRange}</Text>
              </Pressable>
              <Pressable
                onPress={() => setWeekStart((w) => addDays(w, 7))}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Next week"
              >
                <Ionicons name="chevron-forward" size={20} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
              <WeekGrid days={weekDays} todayKey={todayKey} events={state.events} onEventPress={setEditingId} />
            </ScrollView>
          </Card>
        </Section>

        {weekTasks.length > 0 ? (
          <Section label="Tasks this week" aside={`${weekTasks.filter((task) => task.done).length}/${weekTasks.length} done`}>
            <Card>
              {weekTasks.map((task, i) => (
                <View key={task.id} style={i > 0 && styles.upcomingDivider}>
                  <TaskRow task={task} onToggle={() => toggleTask(task.id)} onEdit={() => setEditingTaskId(task.id)} />
                </View>
              ))}
            </Card>
          </Section>
        ) : null}

        <Section label="Coming up">
          <Card>
            {upcoming.length === 0 ? (
              <Text style={[type.body, styles.muted]}>Nothing coming up.</Text>
            ) : (
              upcoming.map((occurrence, i) => (
                <View key={occurrence.event.id} style={i > 0 && styles.upcomingDivider}>
                  <UpcomingRow occurrence={occurrence} todayKey={todayKey} onPress={() => setEditingId(occurrence.event.id)} />
                </View>
              ))
            )}
          </Card>
        </Section>

        <AddAction label="New event" onPress={() => setCreating(true)} />
      </ScrollView>

      <EventForm
        visible={creating}
        todayKey={todayKey}
        editing={null}
        onCancel={() => setCreating(false)}
        onSave={(input) => {
          addEvent(input);
          setCreating(false);
        }}
      />

      <EventForm
        visible={editingEvent !== null}
        todayKey={todayKey}
        editing={editingEvent}
        onCancel={() => setEditingId(null)}
        onSave={(input) => {
          if (editingEvent) updateEvent(editingEvent.id, input);
          setEditingId(null);
        }}
        onDelete={() => {
          if (editingEvent) deleteEvent(editingEvent.id);
          setEditingId(null);
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
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl * 2,
    gap: spacing.xl,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  weekCard: { gap: spacing.sm },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4 },
  weekRange: { color: colors.text },
  dayDivider: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4, paddingTop: 4 },
  upcomingDivider: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4, paddingTop: 4 },
  muted: { color: colors.textMuted },
  pressed: { opacity: 0.7 },
});
