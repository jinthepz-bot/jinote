import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDayKey } from '../coach/days';
import { activityHeatmap } from '../coach/stats';
import {
  createGoal,
  deleteGoal,
  entriesForGoal,
  getFeaturedGoal,
  logProgress,
  setFeaturedGoal,
  setGoalDeadline,
  useCoach,
  type Goal,
} from '../coach/store';
import { useTodayKey } from '../coach/useTodayKey';
import { confirmDestructive } from '../design/confirm';
import { useType } from '../design/fonts';
import { colors, radius, spacing } from '../design/theme';
import { AddAction, Screen, ScreenTitle, Section } from '../design/ui';
import { SettingsButton } from '../navigation/SettingsHost';
import { ActivityHeatmap } from '../goals/ActivityHeatmap';
import { GoalCard } from '../goals/GoalCard';
import { GoalForm } from '../goals/GoalForm';
import { LogProgressSheet } from '../goals/LogProgressSheet';
import { DeadlinePicker } from '../home/DeadlinePicker';

export function GoalsScreen() {
  const type = useType();
  const insets = useSafeAreaInsets();
  const { state, loaded } = useCoach();
  const todayKey = useTodayKey();
  const [creating, setCreating] = useState(false);
  const [logGoalId, setLogGoalId] = useState<string | null>(null);
  const [deadlineGoalId, setDeadlineGoalId] = useState<string | null>(null);

  if (!loaded) return <View style={styles.root} />;

  const featured = getFeaturedGoal(state);
  const heatmap = activityHeatmap(entriesForGoal(state, featured.id), todayKey);
  const others = state.goals.filter((g) => !g.featured);
  const logGoal = state.goals.find((g) => g.id === logGoalId) ?? null;
  const deadlineGoal = state.goals.find((g) => g.id === deadlineGoalId) ?? null;

  const confirmDeleteGoal = (goal: Goal) =>
    confirmDestructive({
      title: `Delete "${goal.title}"?`,
      message: 'Its progress history is deleted too.',
      confirmLabel: 'Delete',
      onConfirm: () => deleteGoal(goal.id),
    });

  const cardFor = (goal: Goal) => (
    <GoalCard
      key={goal.id}
      goal={goal}
      todayKey={todayKey}
      onLog={() => setLogGoalId(goal.id)}
      onEditDeadline={() => setDeadlineGoalId(goal.id)}
      onSetFeatured={() => setFeaturedGoal(goal.id)}
      onDelete={goal.featured ? undefined : () => confirmDeleteGoal(goal)}
    />
  );

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <ScreenTitle
            label={`${state.goals.length} ${state.goals.length === 1 ? 'goal' : 'goals'} · ${formatDayKey(todayKey, todayKey)}`}
            title="GOALS"
            action={<SettingsButton />}
          />

          <Section label="Featured · on Home">{cardFor(featured)}</Section>

          <Section label="Last 3 months" aside={`${heatmap.activeDays}/${heatmap.totalDays} active`}>
            <ActivityHeatmap heatmap={heatmap} todayKey={todayKey} unit={featured.unit} />
          </Section>

          <Section label="Other goals" aside={others.length > 0 ? String(others.length) : undefined}>
            {others.length === 0 ? (
              <Text style={[type.body, styles.muted]}>No other goals yet.</Text>
            ) : (
              others.map(cardFor)
            )}
            <AddAction label="New goal" onPress={() => setCreating(true)} />
          </Section>

        </ScrollView>
      </KeyboardAvoidingView>

      <GoalForm
        visible={creating}
        todayKey={todayKey}
        onCancel={() => setCreating(false)}
        onCreate={(input) => {
          createGoal(input);
          setCreating(false);
        }}
      />

      <LogProgressSheet
        goal={logGoal}
        onClose={() => setLogGoalId(null)}
        onSave={(value, note) => {
          if (logGoal) logProgress(logGoal.id, value, note, todayKey);
          setLogGoalId(null);
        }}
      />

      <DeadlinePicker
        visible={deadlineGoal !== null}
        title={deadlineGoal ? `Deadline · ${deadlineGoal.title}` : 'Deadline'}
        value={deadlineGoal?.deadline ?? null}
        todayKey={todayKey}
        onSave={(day) => {
          if (deadlineGoal) setGoalDeadline(deadlineGoal.id, day);
          setDeadlineGoalId(null);
        }}
        onClear={() => {
          if (deadlineGoal) setGoalDeadline(deadlineGoal.id, null);
          setDeadlineGoalId(null);
        }}
        onClose={() => setDeadlineGoalId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl * 2,
    gap: spacing.xl,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  muted: { color: colors.textMuted },
  pressed: { opacity: 0.7 },
});
