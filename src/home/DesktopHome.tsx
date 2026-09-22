import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { MONTH_NAMES, weekdayIndex } from '../coach/days';
import { currentStreak, last7Days } from '../coach/stats';
import {
  addTask,
  deleteTask,
  entriesForGoal,
  getFeaturedGoal,
  logProgress,
  toggleTask,
  updateTask,
  useCoach,
} from '../coach/store';
import { useTodayKey } from '../coach/useTodayKey';
import { useAccent } from '../design/accent';
import { hoverDim, hoverFill } from '../design/hover';
import { useType } from '../design/fonts';
import { colors, keyboardAppearance, radius, rgba, sizes, spacing } from '../design/theme';
import { Card, Checkbox, fieldStyles } from '../design/ui';
import {
  COACH_PANEL_COLLAPSED_WIDTH,
  COACH_PANEL_WIDTH,
  SIDEBAR_WIDTH,
  useCoachPanelCollapsed,
} from '../navigation/layout';
import { LogProgressSheet } from '../goals/LogProgressSheet';
import { addQuickNote, useNotes } from '../notes/store';
import { useProfile } from '../profile/store';
import { useSchedule } from '../schedule/store';
import { TaskForm } from './TaskForm';
import type { CalendarKind } from '../schedule/calendar/items';
import { kindColors } from '../schedule/calendar/kindColors';
import { doneToday, todoForToday } from './todayItems';
import { WeekBars } from './WeekBars';

const WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Below this content width the two card rows stack instead of sitting side by side.
const SIDE_BY_SIDE_MIN = 640;
const CONTENT_MAX = 980;
const GUTTER = spacing.xl + spacing.sm;

// An empty name (cleared in Settings) drops the ", Jin" — just "Good morning."
function greeting(now: Date, name: string): string {
  const h = now.getHours();
  const time = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  return name.trim() ? `Good ${time}, ${name.trim()}.` : `Good ${time}.`;
}

// "Monday, 21 September"
function dateLine(todayKey: string): string {
  const month = MONTH_NAMES[Number(todayKey.slice(5, 7)) - 1];
  return `${WEEKDAYS_FULL[weekdayIndex(todayKey)]}, ${Number(todayKey.slice(8, 10))} ${month}`;
}

// One shared definition with the calendar (see schedule/calendar/kindColors).
function Tag({ label, tone }: { label: string; tone: CalendarKind }) {
  const type = useType();
  const tint = kindColors(tone);
  return (
    <View style={[styles.tag, { backgroundColor: tint.background }]}>
      <Text style={[type.label, styles.tagText, { color: tint.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function CardHeader({ title, aside }: { title: string; aside?: ReactNode }) {
  const type = useType();
  return (
    <View style={styles.cardHeader}>
      <Text style={[type.display, styles.cardTitle]} accessibilityRole="header">
        {title}
      </Text>
      {aside}
    </View>
  );
}

// The desktop Today screen (window width >= 1024). Same data and actions as the phone
// Home; only the layout differs.
export function DesktopHome() {
  const type = useType();
  const accent = useAccent();
  const { width } = useWindowDimensions();
  const { state, loaded } = useCoach();
  const notes = useNotes();
  const schedule = useSchedule();
  const profile = useProfile();
  const panelCollapsed = useCoachPanelCollapsed();
  const todayKey = useTodayKey();
  const [now, setNow] = useState(() => new Date());
  const [logging, setLogging] = useState(false);
  const [taskForm, setTaskForm] = useState<{ editingId: string | null } | null>(null);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);

  // So "Good morning" turns into "Good afternoon" without a reload.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!loaded || !notes.loaded || !schedule.loaded || !profile.loaded) return <View style={styles.root} />;

  const featured = getFeaturedGoal(state);
  const entries = entriesForGoal(state, featured.id);
  const todayEntries = entries.filter((e) => e.date === todayKey);
  const total = todayEntries.reduce((sum, e) => sum + e.value, 0);
  const left = Math.max(0, featured.target - total);
  const percent = Math.min(100, Math.round((total / featured.target) * 100));
  const unit = featured.unit ? ` ${featured.unit}` : '';
  const streak = currentStreak(entries, todayKey);
  const week = last7Days(entries, todayKey);

  const todo = todoForToday(schedule.state.events, state.tasks, todayKey);
  const done = doneToday(state, todayKey);

  const panelWidth = panelCollapsed ? COACH_PANEL_COLLAPSED_WIDTH : COACH_PANEL_WIDTH;
  const contentWidth = Math.min(CONTENT_MAX, width - SIDEBAR_WIDTH - panelWidth - GUTTER * 2);
  const sideBySide = contentWidth >= SIDE_BY_SIDE_MIN;
  const row = sideBySide ? styles.row : styles.rowStacked;

  const onDark = colors.isDark ? colors.text : colors.background; // cream text on the dark card

  const saveNote = () => {
    if (!addQuickNote(note)) return;
    setNote('');
    setNoteSaved(true);
    Keyboard.dismiss();
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[type.body, styles.date]}>{dateLine(todayKey)}</Text>
              <Text style={[type.display, styles.greeting]} accessibilityRole="header">
                {greeting(now, profile.state.name)}
              </Text>
            </View>
            <Pressable
              onPress={() => setLogging(true)}
              accessibilityRole="button"
              accessibilityLabel={`Log a set of ${featured.title}`}
              style={(state) => [styles.logButton, { backgroundColor: accent.accent }, hoverDim(state)]}
            >
              <Ionicons name="add" size={18} color={accent.onAccent} />
              <Text style={[type.bodyStrong, { color: accent.onAccent }]}>Log a set</Text>
            </Pressable>
          </View>

          <View style={[row, styles.topRow]}>
            <Card style={[styles.goalCard, sideBySide && styles.wide]}>
              <Text style={[type.bodyStrong, styles.goalName]}>{featured.title}</Text>
              <Text style={[type.body, styles.muted]}>
                Daily target · {featured.target}
                {unit}
              </Text>
              <View style={styles.bigRow}>
                <Text style={[type.number, styles.bigNumber]}>{total}</Text>
                <Text style={[type.body, styles.muted]}>
                  of {featured.target}
                  {unit}
                </Text>
              </View>
              <View
                style={styles.track}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: featured.target, now: total }}
              >
                <View style={[styles.fill, { width: `${percent}%`, backgroundColor: accent.accent }]} />
              </View>
              <View style={styles.stats}>
                <Stat label="Sets today" value={todayEntries.length} />
                <Stat label="Best set" value={featured.current} />
                <Stat label="Left" value={left} />
              </View>
            </Card>

            <View style={[styles.streakCard, sideBySide && styles.narrow]}>
              <Text style={[type.body, { color: rgba(onDark, 0.7) }]}>Streak</Text>
              <View style={styles.bigRow}>
                <Text style={[type.number, styles.bigNumber, { color: onDark }]}>{streak}</Text>
                <Text style={[type.body, { color: rgba(onDark, 0.7) }]}>{streak === 1 ? 'day' : 'days'}</Text>
              </View>
              <View style={styles.streakBars}>
                <WeekBars days={week} compact onDark={onDark} />
              </View>
            </View>
          </View>

          <View style={row}>
            <Card style={[styles.listCard, sideBySide && styles.equal]}>
              <CardHeader
                title="To do today"
                aside={
                  <Pressable
                    onPress={() => setTaskForm({ editingId: null })}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Add a task"
                    style={(state) => [styles.plus, { backgroundColor: accent.accent }, hoverDim(state)]}
                  >
                    <Ionicons name="add" size={18} color={accent.onAccent} />
                  </Pressable>
                }
              />
              {todo.length === 0 ? (
                <Text style={[type.body, styles.muted]}>Nothing to do today.</Text>
              ) : (
                todo.map((item, i) => (
                  <View key={item.id} style={[styles.item, i > 0 && styles.divider]}>
                    {item.kind === 'task' ? (
                      <Checkbox checked={false} onPress={() => toggleTask(item.id)} label={`Complete ${item.title}`} />
                    ) : (
                      // Events have no done state, so no checkbox: a marker in the event colour.
                      <View style={[styles.eventMark, { backgroundColor: colors.eventBlue }]} />
                    )}
                    <Text
                      style={[type.body, styles.itemText]}
                      numberOfLines={2}
                      onPress={item.kind === 'task' ? () => setTaskForm({ editingId: item.id }) : undefined}
                    >
                      {item.title}
                    </Text>
                    <Tag label={item.tag} tone={item.tone} />
                  </View>
                ))
              )}
            </Card>

            <Card style={[styles.listCard, sideBySide && styles.equal]}>
              <CardHeader title="Done today" />
              {done.length === 0 ? (
                <Text style={[type.body, styles.muted]}>Nothing yet. Log a set or check something off.</Text>
              ) : (
                done.map((item, i) => (
                  <View key={`${item.kind}-${item.id}`} style={[styles.item, i > 0 && styles.divider]}>
                    {item.kind === 'task' ? (
                      // Checked: pressing it puts the task back on the to-do list.
                      <Checkbox checked onPress={() => toggleTask(item.id)} label={`Mark ${item.title} not done`} />
                    ) : (
                      <View style={[styles.setMark, { backgroundColor: rgba(colors.goalGreen, 0.14) }]}>
                        <Ionicons name="barbell-outline" size={13} color={colors.goalGreen} />
                      </View>
                    )}
                    <Text style={[type.body, styles.itemText]} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {item.time ? <Text style={[type.body, styles.muted, styles.time]}>{item.time}</Text> : null}
                  </View>
                ))
              )}

              <View style={styles.noteRow}>
                <TextInput
                  style={[fieldStyles.input, fieldStyles.single, type.body, styles.noteInput]}
                  value={note}
                  onChangeText={(text) => {
                    setNote(text);
                    setNoteSaved(false);
                  }}
                  placeholder="Quick note…"
                  placeholderTextColor={colors.textMuted}
                  keyboardAppearance={keyboardAppearance}
                  returnKeyType="done"
                  onSubmitEditing={saveNote}
                  accessibilityLabel="Quick note"
                />
                {noteSaved ? <Text style={[type.body, { color: colors.goalGreen }]}>Saved</Text> : null}
              </View>
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <LogProgressSheet
        goal={logging ? featured : null}
        onClose={() => setLogging(false)}
        onSave={(value, text) => {
          logProgress(featured.id, value, text, todayKey);
          setLogging(false);
        }}
      />

      <TaskForm
        visible={taskForm !== null}
        todayKey={todayKey}
        editing={taskForm?.editingId ? (state.tasks.find((t) => t.id === taskForm.editingId) ?? null) : null}
        onCancel={() => setTaskForm(null)}
        onSave={(input) => {
          if (taskForm?.editingId) updateTask(taskForm.editingId, input);
          else addTask(input.text, input.date, input.time);
          setTaskForm(null);
        }}
        onDelete={
          taskForm?.editingId
            ? () => {
                deleteTask(taskForm.editingId!);
                setTaskForm(null);
              }
            : undefined
        }
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const type = useType();
  return (
    <View style={styles.stat}>
      <Text style={[type.body, styles.muted, styles.statLabel]}>{label}</Text>
      <Text style={[type.number, styles.statValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: GUTTER,
    paddingVertical: GUTTER,
    gap: spacing.xl,
    width: '100%',
    maxWidth: CONTENT_MAX + GUTTER * 2,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.lg },
  headerText: { flex: 1, gap: spacing.xs },
  date: { color: colors.textMuted },
  greeting: { fontSize: 44, lineHeight: 52 },
  logButton: {
    height: sizes.control,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  pressed: { opacity: 0.8 },
  muted: { color: colors.textMuted },

  row: { flexDirection: 'row', gap: spacing.lg, alignItems: 'stretch' },
  rowStacked: { flexDirection: 'column', gap: spacing.lg },
  topRow: {},
  wide: { flex: 2, minWidth: 0 },
  narrow: { flex: 1, minWidth: 0 },
  equal: { flex: 1, minWidth: 0 },

  goalCard: { gap: spacing.xs, padding: spacing.xl },
  goalName: { fontSize: 17 },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.sm },
  bigNumber: { fontSize: 64, lineHeight: 72 },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  fill: { height: '100%', borderRadius: 5 },
  stats: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.lg },
  stat: { gap: 2 },
  statLabel: { fontSize: 13 },
  statValue: { fontSize: 24, lineHeight: 30 },

  streakCard: {
    backgroundColor: colors.darkCard,
    borderRadius: radius.card,
    padding: spacing.xl,
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  streakBars: { marginTop: spacing.md },

  listCard: { padding: spacing.xl, gap: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  cardTitle: { fontSize: 22, lineHeight: 28 },
  plus: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 36 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md },
  itemText: { flex: 1, minWidth: 0 },
  time: { fontSize: 13 },
  eventMark: { width: 4, height: 20, borderRadius: 2, marginHorizontal: 9 },
  setMark: { width: sizes.checkbox, height: sizes.checkbox, borderRadius: radius.square, alignItems: 'center', justifyContent: 'center' },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.chip, flexShrink: 0 },
  tagText: { fontSize: 11, letterSpacing: 0.2, textTransform: 'none' },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  noteInput: { flex: 1, minWidth: 0 },
});
