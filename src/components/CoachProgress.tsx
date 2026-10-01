import { StyleSheet, Text, View } from 'react-native';

import { goalActivityName } from '../coach/goal';
import { currentStreak } from '../coach/stats';
import { entriesForGoal, getFeaturedGoal, useCoach } from '../coach/store';
import { useTodayKey } from '../coach/useTodayKey';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, spacing } from '../design/theme';

// The thin line under the coach panel's header: today's progress on the featured goal
// (counted the way the Today page counts it) and the streak. It reads the same store
// the coach's tools write to, so a set logged from the chat shows here at once.
export function CoachProgress() {
  const type = useType();
  const accent = useAccent();
  const todayKey = useTodayKey();
  const { state, loaded } = useCoach();
  if (!loaded) return null;

  const goal = getFeaturedGoal(state);
  const entries = entriesForGoal(state, goal.id);
  const today = entries.filter((e) => e.date === todayKey).reduce((sum, e) => sum + e.value, 0);
  const streak = currentStreak(entries, todayKey);
  const percent = Math.min(100, Math.round((today / goal.target) * 100));

  return (
    <View style={styles.root} accessibilityLabel={`${goalActivityName(goal.title)} ${today} of ${goal.target} today, ${streak} day streak`}>
      <View style={styles.row}>
        <Text style={[type.body, styles.text]} numberOfLines={1}>
          <Text style={type.bodyStrong}>{goalActivityName(goal.title)}</Text> {today}/{goal.target}
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
  track: { height: 3, borderRadius: 2, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});
