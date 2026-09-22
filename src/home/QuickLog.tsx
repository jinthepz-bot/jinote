import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { GoalType, LogEntry } from '../coach/store';
import { hoverDim } from '../design/hover';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, radius, sizes, spacing, keyboardAppearance } from '../design/theme';
import { Card } from '../design/ui';

interface Props {
  goalType: GoalType;
  unit: string;
  todayEntries: LogEntry[];
  onLog: (count: number, note: string) => { isNewBest: boolean };
}

export function QuickLog({ goalType, unit, todayEntries, onLog }: Props) {
  const type = useType();
  const accent = useAccent();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<{ isNewBest: boolean } | null>(null);

  const value = Number.parseInt(amount, 10);
  const valid = Number.isFinite(value) && value > 0;

  const submit = () => {
    if (!valid) return;
    setSaved(onLog(value, note));
    setAmount('');
    setNote('');
    Keyboard.dismiss();
  };

  const edit = (setter: (text: string) => void) => (text: string) => {
    setSaved(null);
    setter(text);
  };

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, type.number, styles.amount]}
          value={amount}
          onChangeText={edit((text) => setAmount(text.replace(/[^0-9]/g, '')))}
          keyboardType="number-pad"
          maxLength={4}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={keyboardAppearance}
          accessibilityLabel={`Amount in ${unit}`}
        />
        <TextInput
          style={[styles.input, type.body, styles.note]}
          value={note}
          onChangeText={edit(setNote)}
          placeholder="Note (optional)"
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={keyboardAppearance}
          returnKeyType="done"
          onSubmitEditing={submit}
          accessibilityLabel="Note"
        />
        <Pressable
          style={(state) => [
            styles.button,
            { backgroundColor: accent.accent },
            !valid && styles.buttonDisabled,
            valid && hoverDim(state),
          ]}
          onPress={submit}
          disabled={!valid}
          accessibilityRole="button"
        >
          <Text style={[type.label, styles.buttonText, { color: accent.onAccent }]}>Log it</Text>
        </Pressable>
      </View>

      <View style={styles.status}>
        <Text style={[type.mono, todayEntries.length > 0 && styles.todayText]}>{describeToday(goalType, unit, todayEntries)}</Text>
        {saved ? <Text style={[type.mono, styles.saved]}>{saved.isNewBest ? 'Saved · New best set!' : 'Saved'}</Text> : null}
      </View>
    </Card>
  );
}

// "Nothing logged today", or a best-result goal's individual sets ("20 + 15 + 10 =
// 45 reps") so today's sets stay visible at a glance, or a cumulative goal's simple
// running total for the day.
function describeToday(goalType: GoalType, unit: string, todayEntries: LogEntry[]): string {
  if (todayEntries.length === 0) return 'Nothing logged today';
  const total = todayEntries.reduce((sum, e) => sum + e.value, 0);
  if (goalType !== 'best') {
    // Matches the single-entry text this used to show: the first entry logged today.
    const note = todayEntries[0]?.note;
    return `Today: ${total} ${unit}${note ? ` · ${note}` : ''}`;
  }
  const sets = todayEntries.map((e) => e.value).join(' + ');
  return todayEntries.length > 1 ? `Today: ${sets} = ${total} ${unit}` : `Today: ${total} ${unit}`;
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  input: {
    height: sizes.control,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
  amount: { width: 64, fontSize: 24, textAlign: 'center' },
  note: { flex: 1, minWidth: 0 },
  button: {
    height: sizes.control,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.control,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  buttonText: { fontSize: 12 },
  status: { gap: spacing.xs / 2 },
  todayText: { color: colors.text },
  saved: { color: colors.success },
});
