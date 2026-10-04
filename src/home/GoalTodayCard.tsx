import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDayKey, formatTime } from '../coach/days';
import { formatAmount } from '../coach/format';
import { dayTotal, goalValue, setsOn, valueCaption } from '../coach/progress';
import { deadlineStatus, goalProgress } from '../coach/stats';
import type { CoachState, Goal, LogEntry } from '../coach/store';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { hoverFill } from '../design/hover';
import { Popover, type PopoverAnchor } from '../design/Popover';
import { SetEditor } from '../goals/SetEditor';
import { colors, rgba, spacing } from '../design/theme';
import { Card } from '../design/ui';

const PB_SHOW_MS = 4000;
const EDITOR_WIDTH = 220;

// The featured goal on Today, in two halves:
// - left, the goal itself: for a record goal the best single set ("30 of 100 in one
//   set"), for a daily goal today's total against the daily target;
// - right, today: everything logged today, and each set as a chip ("08:10 · 20")
//   that opens a small editor to change or delete it.
// One logged set feeds both halves. `stacked` puts the halves one above the other
// (the phone).
export function GoalTodayCard({
  goal,
  state,
  todayKey,
  stacked,
}: {
  goal: Goal;
  state: CoachState;
  todayKey: string;
  stacked?: boolean;
}) {
  const type = useType();
  const accent = useAccent();
  const sets = setsOn(state, goal.id, todayKey);
  const total = dayTotal(sets);
  const value = goalValue(goal, state, todayKey);
  const { percent, done } = goalProgress(goal, value);
  const unit = goal.unit || (goal.type === 'best' ? 'reps' : '');
  const personalBest = usePersonalBest(goal);

  const label = goal.type === 'best' ? 'Record' : goal.type === 'daily' ? 'Daily target' : 'Total';

  return (
    <Card style={[styles.card, stacked ? styles.stacked : styles.row]}>
      <View style={[styles.half, !stacked && [styles.side, styles.left]]}>
        <View style={styles.labelRow}>
          <Text style={type.label}>{label}</Text>
          {personalBest ? (
            <View style={[styles.pb, { backgroundColor: accent.accent }]} accessibilityLiveRegion="polite">
              <Ionicons name="trophy" size={12} color={accent.onAccent} />
              <Text style={[type.bodyStrong, styles.pbText, { color: accent.onAccent }]}>Personal best!</Text>
            </View>
          ) : null}
        </View>
        <Text style={[type.bodyStrong, styles.goalName]} numberOfLines={1}>
          {goal.title}
        </Text>
        <View style={styles.bigRow}>
          <Text style={[type.number, styles.big]}>{formatAmount(value)}</Text>
          <Text style={[type.body, styles.muted]}>{valueCaption(goal)}</Text>
        </View>
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
        >
          <View
            style={[styles.fill, { width: `${percent}%`, backgroundColor: done ? colors.success : accent.accent }]}
          />
        </View>
        <Text style={[type.body, styles.meta]}>{deadlineLine(goal, todayKey, done)}</Text>
      </View>

      <View style={[styles.half, stacked ? styles.topRule : [styles.side, styles.right]]}>
        <Text style={type.label}>Today</Text>
        <View style={styles.bigRow}>
          {goal.type === 'daily' ? (
            <>
              <Text style={[type.number, styles.big]}>{sets.length}</Text>
              <Text style={[type.body, styles.muted]}>{sets.length === 1 ? 'set' : 'sets'}</Text>
            </>
          ) : (
            <>
              <Text style={[type.number, styles.big]}>{formatAmount(total)}</Text>
              <Text style={[type.body, styles.muted]}>{unit || 'total'}</Text>
            </>
          )}
        </View>
        {sets.length === 0 ? (
          <Text style={[type.body, styles.muted]}>No sets yet today.</Text>
        ) : (
          <View style={styles.chips}>
            {sets.map((set) => (
              <SetChip key={set.id} set={set} unit={unit} />
            ))}
          </View>
        )}
      </View>
    </Card>
  );
}

function deadlineLine(goal: Goal, todayKey: string, done: boolean): string {
  if (done && goal.type !== 'daily') return 'Reached!';
  const status = deadlineStatus(goal.deadline, todayKey);
  if (status.kind === 'unset' || !goal.deadline) return 'No deadline';
  const date = formatDayKey(goal.deadline, todayKey);
  if (status.kind === 'upcoming') {
    return status.daysLeft === 0
      ? `Due today, ${date}`
      : `Due ${date} · ${status.daysLeft} ${status.daysLeft === 1 ? 'day' : 'days'} left`;
  }
  return `Was due ${date} · ${status.daysOver} ${status.daysOver === 1 ? 'day' : 'days'} over`;
}

// True for a few seconds after the record goes up — from a set logged here, in the
// log sheet, or by the coach — but not when the screen first shows.
function usePersonalBest(goal: Goal): boolean {
  const seen = useRef<{ id: string; current: number } | null>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const before = seen.current;
    seen.current = { id: goal.id, current: goal.current };
    if (goal.type !== 'best' || !before || before.id !== goal.id || goal.current <= before.current) return;
    setShow(true);
    const timer = setTimeout(() => setShow(false), PB_SHOW_MS);
    return () => clearTimeout(timer);
  }, [goal.id, goal.current, goal.type]);
  return show;
}

// One set from today: "08:10 · 20". Opens a small editor to change or delete it.
function SetChip({ set, unit }: { set: LogEntry; unit: string }) {
  const type = useType();
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const time = set.loggedAt > 0 ? formatTime(set.loggedAt) : null;
  const open = () => ref.current?.measureInWindow((x, y, _w, h) => setAnchor({ top: y + h + 4, above: y, left: x }));

  return (
    <View ref={ref} collapsable={false}>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`Set${time ? ` at ${time}` : ''}: ${formatAmount(set.value)}${unit ? ` ${unit}` : ''}. Edit or delete`}
        style={(s) => [styles.chip, hoverFill(s)]}
      >
        {time ? <Text style={[type.mono, styles.chipTime]}>{time}</Text> : null}
        {time ? <Text style={[type.body, styles.chipDot]}>·</Text> : null}
        <Text style={[type.bodyStrong, styles.chipValue]}>{formatAmount(set.value)}</Text>
      </Pressable>
      <Popover anchor={anchor} width={EDITOR_WIDTH} onClose={() => setAnchor(null)}>
        {anchor ? (
          <SetEditor set={set} unit={unit} title={time ? `Set at ${time}` : 'Set'} onDone={() => setAnchor(null)} />
        ) : null}
      </Popover>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  stacked: { gap: spacing.lg },
  half: { gap: spacing.xs },
  // Side by side, the halves share the width; stacked, they keep their own height.
  side: { flex: 1, minWidth: 0 },
  left: { paddingRight: spacing.xl },
  right: { paddingLeft: spacing.xl, borderLeftWidth: 1, borderLeftColor: colors.divider },
  topRule: { paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider },
  flex: { flex: 1 },
  muted: { color: colors.textMuted },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 22 },
  pb: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 11 },
  pbText: { fontSize: 12, lineHeight: 16 },
  goalName: { fontSize: 16 },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  big: { fontSize: 56, lineHeight: 64 },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.surface2, overflow: 'hidden', marginTop: spacing.xs },
  fill: { height: '100%', borderRadius: 5 },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 30,
    paddingHorizontal: spacing.md,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: rgba(colors.goalGreen, 0.06),
  },
  chipTime: { fontSize: 12 },
  chipDot: { fontSize: 12, color: colors.textMuted },
  chipValue: { fontSize: 14 },
});
