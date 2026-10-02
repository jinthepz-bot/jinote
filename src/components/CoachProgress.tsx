import { StyleSheet, Text, View } from 'react-native';

import { goalActivityName } from '../coach/goal';
import { formatAmount } from '../coach/format';
import { dayTotal, goalValue, setsOn } from '../coach/progress';
import { currentStreak, goalProgress } from '../coach/stats';
import { entriesForGoal, getFeaturedGoal, useCoach } from '../coach/store';
import { useTodayKey } from '../coach/useTodayKey';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, spacing } from '../design/theme';

// The thin line under the coach panel's header: the featured goal's progress, counted
// the way the Today card counts it (a record goal's best single set, with today's
// total beside it), and the streak. It reads the same store the coach's tools write
// to, so a set logged from the chat shows here at once.
export function CoachProgress() {
  const type = useType();
  const accent = useAccent();
  const todayKey = useTodayKey();
  const { state, loaded } = useCoach();
  if (!loaded) return null;

  const goal = getFeaturedGoal(state);
  const entries = entriesForGoal(state, goal.id);
  const today = dayTotal(setsOn(state, goal.id, todayKey));
  const value = goalValue(goal, state, todayKey);
  const streak = currentStreak(entries, todayKey);
  const { percent } = goalProgress(goal, value);
  const name = goalActivityName(goal.title);
  const what =
    goal.type === 'best'
      ? { lead: 'record', rest: ` · today ${formatAmount(today)}` }
      : goal.type === 'daily'
        ? { lead: '', rest: ' today' }
        : { lead: '', rest: '' };
  const label =
    goal.type === 'best'
      ? `${name} record ${value} of ${goal.target} in one set, ${today} today, ${streak} day streak`
      : `${name} ${value} of ${goal.target}${what.rest}, ${streak} day streak`;

  return (
    <View style={styles.root} accessibilityLabel={label}>
      <View style={styles.row}>
        <Text style={[type.body, styles.text]} numberOfLines={1}>
          <Text style={type.bodyStrong}>{name}</Text>
          {what.lead ? ` ${what.lead}` : ''} {formatAmount(value)}/{formatAmount(goal.target)}
          <Text style={styles.muted}>{what.rest}</Text>
        </Text>
        <Text style={[type.body, styles.streak]}>
          {streak > 0 ? `${streak}-day streak` : 'No streak yet'}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%`, backgroundColor: accent.accent }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  text: { flexShrink: 1, fontSize: 13 },
  streak: { fontSize: 12, color: colors.textMuted },
  muted: { color: colors.textMuted },
  track: { height: 3, borderRadius: 2, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});
