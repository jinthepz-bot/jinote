import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, radius, spacing } from '../design/theme';
import { Card } from '../design/ui';
import type { StepStatus, TaskMessage } from '../types';
import { ActionChips } from './ActionChips';

function statusLabel(task: TaskMessage): string {
  const total = task.steps.length;
  switch (task.status) {
    case 'running': {
      const current = task.steps.findIndex((s) => s.status === 'running');
      return `Step ${Math.max(current, 0) + 1} of ${total}`;
    }
    case 'reporting':
      return 'Writing report';
    case 'done':
      return `Done: ${total} ${total === 1 ? 'step' : 'steps'}`;
    case 'error':
      return 'Failed';
    case 'stopped':
      return 'Stopped';
  }
}

function StepIcon({ status }: { status: StepStatus }) {
  const type = useType();
  const accent = useAccent();
  if (status === 'running') {
    return <ActivityIndicator size="small" color={accent.accent} style={styles.icon} />;
  }
  if (status === 'done' || status === 'error') {
    return (
      <View style={styles.icon}>
        <Ionicons
          name={status === 'done' ? 'checkmark' : 'close'}
          size={18}
          color={status === 'done' ? colors.success : colors.accentStrong}
        />
      </View>
    );
  }
  const glyph = status === 'pending' ? '○' : '–';
  return <Text style={[type.mono, styles.icon, styles.glyph, { color: colors.textMuted }]}>{glyph}</Text>;
}

export function TaskCard({ task }: { task: TaskMessage }) {
  const type = useType();
  const accent = useAccent();
  const [expanded, setExpanded] = useState<number | null>(null);
  const done = task.steps.filter((s) => s.status === 'done').length;
  const active = task.status === 'running' || task.status === 'reporting';
  const labelColor =
    task.status === 'done'
      ? colors.success
      : task.status === 'error'
        ? colors.accentStrong
        : active
          ? accent.accent
          : colors.textMuted;

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={type.label}>Task</Text>
        <Text style={[type.label, { color: labelColor }]}>{statusLabel(task)}</Text>
      </View>
      <Text style={[type.bodyStrong, styles.title]}>{task.title}</Text>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${(done / task.steps.length) * 100}%`, backgroundColor: accent.accent }]} />
      </View>

      {task.steps.map((step, i) => {
        const isOpen = expanded === i;
        const changeCount = step.actions?.length ?? 0;
        const expandable = Boolean(step.output) || changeCount > 0;
        return (
          <Pressable key={i} style={styles.step} disabled={!expandable} onPress={() => setExpanded(isOpen ? null : i)}>
            <View style={styles.stepRow}>
              <StepIcon status={step.status} />
              <Text
                style={[
                  type.body,
                  styles.stepTitle,
                  step.status === 'pending' && styles.pendingText,
                  step.status === 'running' && type.bodyStrong,
                ]}
              >
                {step.title}
              </Text>
              {changeCount > 0 ? (
                <Text style={[type.mono, styles.changeCount]}>
                  {changeCount} {changeCount === 1 ? 'change' : 'changes'}
                </Text>
              ) : null}
              {expandable ? <Text style={[type.mono, styles.chevron]}>{isOpen ? '▾' : '▸'}</Text> : null}
            </View>
            {isOpen ? (
              <View style={styles.stepDetail}>
                {step.actions?.length ? <ActionChips actions={step.actions} /> : null}
                {step.output ? (
                  <Text selectable style={[type.body, styles.stepOutput]}>
                    {step.output}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </Pressable>
        );
      })}

      {task.actions?.length ? <ActionChips actions={task.actions} style={styles.taskChips} /> : null}

      {task.status === 'reporting' ? (
        <View style={styles.reporting}>
          <ActivityIndicator size="small" color={accent.accent} />
          <Text style={[type.label, { color: accent.accent }]}>Writing final report...</Text>
        </View>
      ) : null}

      {task.result ? (
        <View style={styles.result}>
          <Text style={type.label}>Result</Text>
          <Text selectable style={type.body}>
            {task.result}
          </Text>
        </View>
      ) : null}

      {task.error ? <Text style={[type.body, styles.error]}>{task.error}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', marginVertical: 6 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 17, lineHeight: 23, marginTop: spacing.sm },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: 12,
    overflow: 'hidden',
  },
  fill: { height: '100%' },
  step: { paddingVertical: spacing.sm },
  stepRow: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 22, marginRight: 8, alignItems: 'center' },
  glyph: { fontSize: 15, textAlign: 'center' },
  stepTitle: { flex: 1 },
  pendingText: { color: colors.textMuted },
  changeCount: { fontSize: 11, color: colors.success, marginLeft: 8 },
  chevron: { color: colors.textMuted, marginLeft: 8 },
  stepDetail: { marginTop: spacing.sm, marginLeft: 30, gap: spacing.sm },
  stepOutput: {
    fontSize: 14,
    lineHeight: 20,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    padding: spacing.md,
  },
  taskChips: { marginTop: 8 },
  reporting: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md },
  result: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  error: {
    marginTop: spacing.md,
    fontSize: 14,
    backgroundColor: colors.accentStrongSoft,
    borderWidth: 1,
    borderColor: colors.accentStrong,
    borderRadius: radius.control,
    padding: spacing.md,
    overflow: 'hidden',
  },
});
