import { StyleSheet, Text, View } from 'react-native';

import { formatDayKey } from '../coach/days';
import { formatAmount } from '../coach/format';
import { GOAL_TYPE_LABELS } from '../coach/progress';
import { deadlineStatus, goalProgress } from '../coach/stats';
import type { Goal } from '../coach/store';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, spacing } from '../design/theme';
import { Button, Card, IconButton } from '../design/ui';

interface Props {
  goal: Goal;
  value: number; // what it's measured by now: best single set, today's total or running total (see goalValue)
  todayKey: string;
  onLog: () => void;
  onEditDeadline: () => void;
  onSetFeatured?: () => void;
  onDelete?: () => void;
}

function describeDeadline(goal: Goal, todayKey: string, done: boolean): { text: string; warn: boolean } {
  const status = deadlineStatus(goal.deadline, todayKey);
  if (status.kind === 'unset' || !goal.deadline) return { text: 'No deadline', warn: false };
  const date = formatDayKey(goal.deadline, todayKey);
  if (status.kind === 'upcoming') {
    const left = status.daysLeft === 0 ? 'due today' : `${status.daysLeft} ${status.daysLeft === 1 ? 'day' : 'days'} left`;
    return { text: `Due ${date} · ${left}`, warn: !done && status.daysLeft <= 7 };
  }
  return { text: `${date} · ${status.daysOver} ${status.daysOver === 1 ? 'day' : 'days'} over`, warn: !done };
}

export function GoalCard({ goal, value, todayKey, onLog, onEditDeadline, onSetFeatured, onDelete }: Props) {
  const type = useType();
  const accent = useAccent();
  const { percent, done } = goalProgress(goal, value);
  const deadline = describeDeadline(goal, todayKey, done);
  const unit = goal.unit ? ` ${goal.unit}` : '';

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <View style={styles.titleBlock}>
          <Text style={type.bodyStrong} numberOfLines={2}>
            {goal.title}
          </Text>
          <Text style={[type.label, done && styles.doneText]}>
            {GOAL_TYPE_LABELS[goal.type]}
            {done ? (goal.type === 'daily' ? ' · Done today' : ' · Reached') : ''}
          </Text>
        </View>
        <View style={styles.numbers}>
          <Text style={[type.number, styles.current]} numberOfLines={1}>
            {formatAmount(value)}
          </Text>
          <Text style={type.mono} numberOfLines={1}>
            / {formatAmount(goal.target)}
            {unit}
            {goal.type === 'daily' ? ' today' : goal.type === 'best' ? ' in one set' : ''}
          </Text>
        </View>
      </View>

      {goal.description ? (
        <Text style={[type.body, styles.description]} numberOfLines={2}>
          {goal.description}
        </Text>
      ) : null}

      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
        <View style={[styles.fill, { width: `${percent}%`, backgroundColor: accent.accent }, done && styles.fillDone]} />
      </View>

      <View style={styles.meta}>
        <Text style={[type.mono, styles.deadline, deadline.warn && styles.warn]} numberOfLines={1}>
          {deadline.text}
        </Text>
        <Text style={[type.mono, { color: accent.accent }, done && styles.doneText]}>{percent}%</Text>
      </View>

      <View style={styles.actions}>
        <IconButton icon="calendar-outline" label={`Edit deadline for ${goal.title}`} onPress={onEditDeadline} />
        {onSetFeatured ? (
          <IconButton
            icon={goal.featured ? 'star' : 'star-outline'}
            label={goal.featured ? `Currently focused: ${goal.title}` : `Make ${goal.title} my focus`}
            color={goal.featured ? accent.accent : colors.textMuted}
            onPress={onSetFeatured}
          />
        ) : null}
        {onDelete ? <IconButton icon="trash-outline" label={`Delete ${goal.title}`} onPress={onDelete} /> : null}
        <View style={styles.spacer} />
        <Button label="Log progress" small onPress={onLog} accessibilityLabel={`Log progress for ${goal.title}`} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  titleBlock: { flex: 1, gap: 2 },
  numbers: { alignItems: 'flex-end', maxWidth: '45%' },
  current: { fontSize: 32, lineHeight: 34 },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  fill: { height: '100%' },
  fillDone: { backgroundColor: colors.success },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  deadline: { flex: 1 },
  warn: { color: colors.accentStrong },
  doneText: { color: colors.success },
  description: { fontSize: 14, color: colors.textMuted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spacer: { flex: 1 },
});
