import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { formatAmount, parseAmount, sanitizeAmountInput } from '../coach/format';
import { dayTotal, setsOn } from '../coach/progress';
import { useCoach, type Goal } from '../coach/store';
import { useTodayKey } from '../coach/useTodayKey';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { Sheet } from '../design/Sheet';
import { colors, spacing, keyboardAppearance } from '../design/theme';
import { Button, fieldStyles } from '../design/ui';

interface Props {
  goal: Goal | null;
  onClose: () => void;
  onSave: (value: number, note: string) => void;
}

export function LogProgressSheet({ goal, onClose, onSave }: Props) {
  return (
    <Sheet visible={goal !== null} onClose={onClose}>
      {goal ? <LogBody goal={goal} onClose={onClose} onSave={onSave} /> : null}
    </Sheet>
  );
}

function LogBody({ goal, onClose, onSave }: { goal: Goal } & Omit<Props, 'goal'>) {
  const type = useType();
  const accent = useAccent();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const value = parseAmount(amount);
  const unit = goal.unit ? ` ${goal.unit}` : '';

  const { state } = useCoach();
  const todayKey = useTodayKey();
  const today = dayTotal(setsOn(state, goal.id, todayKey));

  const explanation =
    goal.type === 'best'
      ? `Best single set so far: ${formatAmount(goal.current)}${unit}. Only a higher set raises it. Each log adds another set for today (${formatAmount(today)}${unit} so far).`
      : goal.type === 'daily'
        ? `Today so far: ${formatAmount(today)} of ${formatAmount(goal.target)}${unit}. Each log adds to today's total.`
        : `Total so far: ${formatAmount(goal.current)}${unit}. What you log is added to it.`;

  let preview = '';
  if (value !== null) {
    preview =
      goal.type === 'best'
        ? value > goal.current
          ? 'New best!'
          : `Doesn't beat your best of ${formatAmount(goal.current)}`
        : goal.type === 'daily'
          ? `Today's total: ${formatAmount(today + value)}${unit}`
          : `New total: ${formatAmount(goal.current + value)}${unit}`;
  }

  const save = () => {
    if (value !== null) onSave(value, note);
  };

  return (
    <>
      <Text style={type.label}>Log progress</Text>
      <Text style={[type.bodyStrong, styles.title]}>{goal.title}</Text>
      <Text style={type.mono}>{explanation}</Text>

      <View style={styles.row}>
        <TextInput
          style={[fieldStyles.input, fieldStyles.single, type.number, styles.amount]}
          value={amount}
          onChangeText={(text) => setAmount(sanitizeAmountInput(text))}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={keyboardAppearance}
          autoFocus
          accessibilityLabel="Progress amount"
        />
        <TextInput
          style={[fieldStyles.input, fieldStyles.single, type.body, styles.note]}
          value={note}
          onChangeText={setNote}
          placeholder="Note (optional)"
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={keyboardAppearance}
          returnKeyType="done"
          onSubmitEditing={save}
          accessibilityLabel="Progress note"
        />
      </View>
      <Text style={[type.mono, { color: accent.accent }]}>{preview || ' '}</Text>

      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" onPress={onClose} />
        <Button label="Save" onPress={save} disabled={value === null} accessibilityLabel="Save progress" />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, lineHeight: 24 },
  row: { flexDirection: 'row', gap: spacing.sm },
  amount: { width: 110, fontSize: 26, textAlign: 'center' },
  note: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
});
