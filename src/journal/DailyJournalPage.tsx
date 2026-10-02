import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextStyle,
} from 'react-native';

import {
  addDays,
  daysInMonth,
  formatDayKey,
  isDayKey,
  makeDayKey,
  MONTH_NAMES,
  parseDayKey,
  weekdayIndex,
} from '../coach/days';
import { useCoach } from '../coach/store';
import { useTodayKey } from '../coach/useTodayKey';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { hoverFill, hoverStyles, pointerState } from '../design/hover';
import { colors, keyboardAppearance, radius, rgba, sizes, spacing } from '../design/theme';
import { Card } from '../design/ui';
import {
  COACH_PANEL_COLLAPSED_WIDTH,
  COACH_PANEL_WIDTH,
  SIDEBAR_WIDTH,
  useCoachPanelCollapsed,
} from '../navigation/layout';
import { useSchedule } from '../schedule/store';
import { MOODS, moodOf, moodOnDark } from './mood';
import { dayRecap, type RecapItem } from './recap';
import { saveDailyEntry, useDaily, type DailyEntry, type DailyFields, type Mood } from './store';

const WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const CONTENT_MAX = 980;
const GUTTER = spacing.xl + spacing.sm;
const SIDE_COLUMN = 320;
// Below this content width the right column drops under the writing card.
const SIDE_BY_SIDE_MIN = 720;
// Typing is saved once it pauses this long (and straight away on leaving the day).
const SAVE_DELAY_MS = 700;

const CELL = 30;
const CELL_GAP = 6;
const TOOLTIP_WIDTH = 150;

// The page is the field, so no browser focus ring (see notes/NotePage).
const noOutline = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;

// "Wednesday, 23 September", with the year when it isn't this year's.
function dayTitle(date: string, todayKey: string): string {
  const p = parseDayKey(date)!;
  const base = `${WEEKDAYS_FULL[weekdayIndex(date)]}, ${p.day} ${MONTH_NAMES[p.month - 1]}`;
  return p.year === parseDayKey(todayKey)?.year ? base : `${base} ${p.year}`;
}

type SaveStatus = 'saving' | 'saved';

// The desktop Daily journal: one page per day — a mood, three questions that save
// as you type, what the other screens recorded for that day, and the month's moods.
// `day` undefined means today. Days after today can't be opened.
export function DailyJournalPage({ day, onDayChange }: { day?: string; onDayChange: (day: string | undefined) => void }) {
  const type = useType();
  const todayKey = useTodayKey();
  const { width } = useWindowDimensions();
  const panelCollapsed = useCoachPanelCollapsed();
  const daily = useDaily();
  const coach = useCoach();
  const schedule = useSchedule();
  // Which day the status belongs to, so a save landing for the day just left
  // doesn't show on the next one.
  const [status, setStatus] = useState<{ date: string; kind: SaveStatus } | null>(null);

  const date = day && isDayKey(day) && day < todayKey ? day : todayKey;
  const isToday = date === todayKey;

  if (!daily.loaded || !coach.loaded || !schedule.loaded) return <View style={styles.root} />;

  const entry = daily.state.entries[date];
  const shownStatus: SaveStatus | null = status?.date === date ? status.kind : entry ? 'saved' : null;
  const goTo = (next: string) => onDayChange(next >= todayKey ? undefined : next);

  const panelWidth = panelCollapsed ? COACH_PANEL_COLLAPSED_WIDTH : COACH_PANEL_WIDTH;
  const contentWidth = Math.min(CONTENT_MAX, width - SIDEBAR_WIDTH - panelWidth - GUTTER * 2);
  const sideBySide = contentWidth >= SIDE_BY_SIDE_MIN;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <ArrowButton icon="chevron-back" label="Previous day" onPress={() => goTo(addDays(date, -1))} />
          <Text style={[type.display, styles.title]} accessibilityRole="header" numberOfLines={1}>
            {dayTitle(date, todayKey)}
          </Text>
          <ArrowButton icon="chevron-forward" label="Next day" disabled={isToday} onPress={() => goTo(addDays(date, 1))} />
          <View style={styles.headerSpacer} />
          {!isToday ? (
            <Pressable
              onPress={() => onDayChange(undefined)}
              accessibilityRole="button"
              accessibilityLabel="Go to today"
              style={(s) => [styles.todayButton, hoverFill(s)]}
            >
              <Text style={[type.bodyStrong, styles.todayText]}>Today</Text>
            </Pressable>
          ) : null}
          <Text style={[type.body, styles.status]} accessibilityLiveRegion="polite">
            {shownStatus === 'saving' ? 'Saving…' : shownStatus === 'saved' ? 'Saved' : ''}
          </Text>
        </View>

        <View style={sideBySide ? styles.row : styles.stack}>
          <DailyEditor
            key={date}
            date={date}
            isToday={isToday}
            entry={entry}
            onStatus={(kind) => setStatus({ date, kind })}
          />
          <View style={[styles.side, sideBySide && { width: SIDE_COLUMN }]}>
            <RecapCard isToday={isToday} items={dayRecap(coach.state, schedule.state.events, date)} />
            <MoodGrid date={date} todayKey={todayKey} entries={daily.state.entries} onPick={goTo} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ArrowButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={(s) => [styles.arrow, disabled ? styles.disabled : hoverFill(s)]}
    >
      <Ionicons name={icon} size={18} color={colors.text} />
    </Pressable>
  );
}

const EMPTY: DailyFields = { mood: null, wentWell: '', gotInTheWay: '', tomorrowFocus: '' };

const QUESTIONS: { field: 'wentWell' | 'gotInTheWay' | 'tomorrowFocus'; label: string; placeholder: string }[] = [
  { field: 'wentWell', label: 'What went well?', placeholder: 'Small wins count.' },
  { field: 'gotInTheWay', label: 'What got in the way?', placeholder: 'Be honest — no judgement here.' },
  { field: 'tomorrowFocus', label: "Tomorrow's one thing", placeholder: 'The one thing that would make tomorrow count.' },
];

// Keyed by date, so moving to another day starts fresh from that day's entry.
// Text is held here while typing and saved once it pauses; a mood saves at once.
// Anything still waiting is saved when the day is left.
function DailyEditor({
  date,
  isToday,
  entry,
  onStatus,
}: {
  date: string;
  isToday: boolean;
  entry: DailyEntry | undefined;
  onStatus: (status: SaveStatus) => void;
}) {
  const type = useType();
  const [fields, setFields] = useState<DailyFields>(() => (entry ? { ...entry } : EMPTY));
  const pending = useRef<Partial<DailyFields>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (Object.keys(pending.current).length === 0) return;
    saveDailyEntry(date, pending.current);
    pending.current = {};
    onStatusRef.current('saved');
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => () => flushRef.current(), []);

  const change = (patch: Partial<DailyFields>, now = false) => {
    setFields((f) => ({ ...f, ...patch }));
    pending.current = { ...pending.current, ...patch };
    if (now) {
      flush();
      return;
    }
    onStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY_MS);
  };

  return (
    <Card style={styles.editor}>
      <Text style={[type.display, styles.cardTitle]} accessibilityRole="header">
        {isToday ? 'How was today?' : 'How was the day?'}
      </Text>
      <View style={styles.moods} accessibilityRole="radiogroup" accessibilityLabel="Mood">
        {MOODS.map((m) => (
          <MoodButton
            key={m.value}
            mood={m.value}
            selected={fields.mood === m.value}
            // Choosing the selected mood again clears it.
            onPress={() => change({ mood: fields.mood === m.value ? null : m.value }, true)}
          />
        ))}
      </View>

      {QUESTIONS.map((q) => (
        <Question
          key={q.field}
          label={q.label}
          placeholder={q.placeholder}
          value={fields[q.field]}
          onChange={(text) => change({ [q.field]: text })}
          // Leaving a field (say, to ask the coach about it) saves straight away.
          onBlur={() => flushRef.current()}
        />
      ))}
    </Card>
  );
}

function MoodButton({ mood, selected, onPress }: { mood: Mood; selected: boolean; onPress: () => void }) {
  const type = useType();
  const m = moodOf(mood);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      aria-checked={selected}
      accessibilityLabel={m.label}
      style={(s) => [
        styles.mood,
        selected && { borderColor: colors.text, backgroundColor: rgba(m.color, 0.14) },
        hoverFill(s),
      ]}
    >
      <View style={[styles.moodDot, { backgroundColor: m.color }]} />
      <Text style={[selected ? type.bodyStrong : type.body, styles.moodLabel]}>{m.label}</Text>
    </Pressable>
  );
}

function Question({
  label,
  placeholder,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (text: string) => void;
  onBlur: () => void;
}) {
  const type = useType();
  const accent = useAccent();
  const [height, setHeight] = useState(0);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.question}>
      <Text style={[type.bodyStrong, styles.questionLabel]}>{label}</Text>
      <TextInput
        style={[
          type.body,
          styles.answer,
          noOutline,
          { height: Math.max(56, height), borderBottomColor: focused ? accent.accent : colors.border },
        ]}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlur();
        }}
        onContentSizeChange={(e) => setHeight(e.nativeEvent.contentSize.height)}
        placeholder={placeholder}
        placeholderTextColor={rgba(colors.textMuted, 0.7)}
        keyboardAppearance={keyboardAppearance}
        multiline
        textAlignVertical="top"
        accessibilityLabel={label}
      />
    </View>
  );
}

const RECAP_ICONS = {
  set: { name: 'barbell-outline', color: colors.goalGreen },
  event: { name: 'calendar-outline', color: colors.eventBlue },
  task: { name: 'checkmark-circle-outline', color: colors.textMuted },
} as const;

function RecapCard({ isToday, items }: { isToday: boolean; items: RecapItem[] }) {
  const type = useType();
  return (
    <Card style={styles.sideCard}>
      <Text style={[type.display, styles.cardTitle]} accessibilityRole="header">
        {isToday ? 'From today' : 'From this day'}
        <Text style={[type.body, styles.muted, styles.titleAside]}> · automatic</Text>
      </Text>
      {items.length === 0 ? (
        <Text style={[type.body, styles.muted]}>
          {isToday ? 'Nothing logged, scheduled or ticked off yet today.' : 'A quiet day — nothing logged, scheduled or ticked off.'}
        </Text>
      ) : (
        <View>
          {items.map((item, i) => (
            <View key={item.id} style={[styles.recapRow, i > 0 && styles.recapDivider]}>
              <Ionicons name={RECAP_ICONS[item.kind].name} size={15} color={RECAP_ICONS[item.kind].color} />
              <Text style={[type.body, styles.recapText]} numberOfLines={2}>
                {item.text}
              </Text>
              {item.time ? <Text style={[type.mono, styles.recapTime]}>{item.time}</Text> : null}
            </View>
          ))}
        </View>
      )}
      <Text style={[type.mono, styles.caption]}>Pulled from Goals, Schedule and To-do</Text>
    </Card>
  );
}

// Every day of the viewed day's month, Monday first, coloured by mood. Hovering a
// square names the day and its mood; clicking one opens it. Days after today are
// drawn but can't be opened.
function MoodGrid({
  date,
  todayKey,
  entries,
  onPick,
}: {
  date: string;
  todayKey: string;
  entries: Record<string, DailyEntry>;
  onPick: (day: string) => void;
}) {
  const type = useType();
  const [hovered, setHovered] = useState<string | null>(null);
  const { year, month } = parseDayKey(date)!;
  const first = makeDayKey(year, month, 1);
  const lead = (weekdayIndex(first) + 6) % 7; // blanks before the 1st, weeks starting Monday
  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => makeDayKey(year, month, i + 1));

  const hoveredIndex = hovered ? days.indexOf(hovered) + lead : -1;
  const gridWidth = 7 * CELL + 6 * CELL_GAP;
  const tooltipLeft =
    hoveredIndex >= 0
      ? Math.min(gridWidth - TOOLTIP_WIDTH, Math.max(0, (hoveredIndex % 7) * (CELL + CELL_GAP) + CELL / 2 - TOOLTIP_WIDTH / 2))
      : 0;
  const tooltipTop = hoveredIndex >= 0 ? Math.floor(hoveredIndex / 7) * (CELL + CELL_GAP) - 32 : 0;

  const describe = (day: string) => {
    const mood = entries[day]?.mood;
    const what = day > todayKey ? 'Not yet' : mood ? moodOf(mood).label : entries[day] ? 'No mood' : 'No entry';
    return `${formatDayKey(day, todayKey)} · ${what}`;
  };

  return (
    <Card style={styles.sideCard}>
      <Text style={[type.display, styles.cardTitle]} accessibilityRole="header">
        {MONTH_NAMES[month - 1]} mood
      </Text>
      <View style={{ width: gridWidth }}>
        <View style={styles.gridRow}>
          {WEEKDAY_INITIALS.map((d, i) => (
            <Text key={i} style={[type.label, styles.weekday]}>
              {d}
            </Text>
          ))}
        </View>
        <View style={styles.grid}>
          {Array.from({ length: lead }, (_, i) => (
            <View key={`blank-${i}`} style={styles.cell} />
          ))}
          {days.map((day) => {
            const mood = entries[day]?.mood ?? null;
            const future = day > todayKey;
            const selected = day === date;
            const fill = mood ? moodOf(mood).color : future ? 'transparent' : colors.surface2;
            const number = Number(day.slice(8));
            return (
              <Pressable
                key={day}
                onPress={() => onPick(day)}
                disabled={future}
                onHoverIn={() => setHovered(day)}
                onHoverOut={() => setHovered((h) => (h === day ? null : h))}
                accessibilityRole="button"
                accessibilityLabel={describe(day)}
                accessibilityState={{ selected, disabled: future }}
                style={(s) => [
                  styles.cell,
                  styles.square,
                  { backgroundColor: fill },
                  future && styles.futureCell,
                  selected && styles.selectedCell,
                  !future && squareHover(s, selected),
                ]}
              >
                <Text
                  style={[
                    styles.cellNumber,
                    { color: mood && moodOnDark(mood) ? colors.surface : colors.textMuted },
                    day === todayKey && styles.todayNumber,
                  ]}
                >
                  {number}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {hovered ? (
          <View pointerEvents="none" style={[styles.tooltip, { left: tooltipLeft, top: tooltipTop + 22 }]}>
            <Text style={[type.body, styles.tooltipText]} numberOfLines={1}>
              {describe(hovered)}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.legend}>
        {MOODS.map((m) => (
          <View key={m.value} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: m.color }]} />
            <Text style={[type.body, styles.legendText]}>{m.label}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

// A square keeps its mood colour on hover — it gets an outline instead (the
// selected day already has the dark one).
function squareHover(state: Parameters<typeof hoverFill>[0], selected: boolean) {
  const { hovered, pressed } = pointerState(state);
  return [hoverStyles.pointer, hovered && !selected && styles.hoveredCell, pressed && hoverStyles.pressedDim];
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: GUTTER,
    paddingVertical: GUTTER,
    gap: spacing.xl,
    width: '100%',
    maxWidth: CONTENT_MAX + GUTTER * 2,
    alignSelf: 'center',
  },
  muted: { color: colors.textMuted },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 40, lineHeight: 48, flexShrink: 1, marginHorizontal: spacing.xs },
  headerSpacer: { flex: 1 },
  arrow: {
    width: sizes.controlSm,
    height: sizes.controlSm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.35 },
  todayButton: {
    height: sizes.controlSm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  todayText: { fontSize: 13 },
  status: { fontSize: 12, color: colors.textMuted, minWidth: 56, textAlign: 'right' },

  row: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  stack: { gap: spacing.lg },
  side: { gap: spacing.lg },

  cardTitle: { fontSize: 22, lineHeight: 28 },
  titleAside: { fontSize: 13 },

  editor: { flex: 1, minWidth: 0, padding: spacing.xl, gap: spacing.lg },
  moods: { flexDirection: 'row', gap: spacing.sm },
  mood: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  moodDot: { width: 16, height: 16, borderRadius: 8 },
  moodLabel: { fontSize: 13 },

  question: { gap: 4, marginTop: spacing.xs },
  questionLabel: { fontSize: 15 },
  answer: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: spacing.sm,
    borderWidth: 0,
    borderBottomWidth: 1,
    backgroundColor: 'transparent',
  },

  sideCard: { padding: spacing.xl, gap: spacing.md },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  recapDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  recapText: { flex: 1, fontSize: 14 },
  recapTime: { fontSize: 12 },
  caption: { fontSize: 11 },

  gridRow: { flexDirection: 'row', gap: CELL_GAP, marginBottom: 6 },
  weekday: { width: CELL, textAlign: 'center', fontSize: 10, letterSpacing: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: CELL_GAP },
  cell: { width: CELL, height: CELL },
  square: { borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  futureCell: { borderWidth: 1, borderColor: colors.divider, borderStyle: 'dashed' },
  selectedCell: { borderColor: colors.text },
  hoveredCell: { borderColor: colors.textMuted },
  cellNumber: { fontSize: 10, lineHeight: 12 },
  todayNumber: { fontWeight: '700', textDecorationLine: 'underline' },
  tooltip: {
    position: 'absolute',
    width: TOOLTIP_WIDTH,
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
    backgroundColor: colors.darkCard,
  },
  tooltipText: { fontSize: 12, lineHeight: 16, color: colors.background },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 12, color: colors.textMuted },
});
