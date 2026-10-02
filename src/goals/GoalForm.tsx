import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { describeDayDistance, formatDayKey } from '../coach/days';
import { parseAmount, sanitizeAmountInput } from '../coach/format';
import type { GoalType, NewGoalInput } from '../coach/store';
import { useType } from '../design/fonts';
import { Sheet } from '../design/Sheet';
import { colors, radius, spacing, keyboardAppearance } from '../design/theme';
import { useAccent } from '../design/accent';
import { Button, fieldStyles, Segmented } from '../design/ui';
import { MonthCalendar } from '../home/MonthCalendar';

interface Props {
  visible: boolean;
  todayKey: string;
  onCancel: () => void;
  onCreate: (input: NewGoalInput) => void;
}

const TYPES: { value: GoalType; label: string; hint: string }[] = [
  { value: 'best', label: 'Best single set', hint: 'A record: the most in one go counts, like push-ups in one unbroken set.' },
  { value: 'daily', label: 'Daily total', hint: 'A daily target: everything you log today adds up, and it starts again tomorrow.' },
];

export function GoalForm({ visible, onCancel, ...rest }: Props) {
  return (
    <Sheet visible={visible} onClose={onCancel}>
      <FormBody onCancel={onCancel} {...rest} />
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const type = useType();
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      {children}
    </View>
  );
}

function FormBody({ todayKey, onCancel, onCreate }: Omit<Props, 'visible'>) {
  const type = useType();
  const accent = useAccent();
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [goalType, setGoalType] = useState<GoalType>('best');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const targetValue = parseAmount(target);
  const canCreate = title.trim() !== '' && targetValue !== null;

  const create = () => {
    if (canCreate) onCreate({ title: title.trim(), target: targetValue, type: goalType, deadline, description });
  };

  return (
    <>
      <Text style={[type.display, styles.heading]}>NEW GOAL</Text>

      <Field label="Title">
        <TextInput
          style={[fieldStyles.input, fieldStyles.single, type.body]}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Save for a new bike"
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={keyboardAppearance}
          autoFocus
          accessibilityLabel="Goal title"
        />
      </Field>

      <Field label="Description (optional)">
        <TextInput
          style={[fieldStyles.input, fieldStyles.single, type.body]}
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. 100 push-ups in one unbroken set"
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={keyboardAppearance}
          accessibilityLabel="Goal description"
        />
      </Field>

      <Field label={goalType === 'daily' ? 'Target per day' : 'Target'}>
        <TextInput
          style={[fieldStyles.input, fieldStyles.single, type.number, styles.target]}
          value={target}
          onChangeText={(text) => setTarget(sanitizeAmountInput(text))}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={keyboardAppearance}
          accessibilityLabel="Goal target"
        />
      </Field>

      <Field label="Type">
        <Segmented options={TYPES} value={goalType} onChange={setGoalType} />
        <Text style={type.mono}>{TYPES.find((t) => t.value === goalType)!.hint}</Text>
      </Field>

      <Field label="Deadline (optional)">
        <View style={styles.deadlineRow}>
          <Text style={[type.mono, styles.deadlineText]}>
            {deadline ? `${formatDayKey(deadline, todayKey)} · ${describeDayDistance(todayKey, deadline)}` : 'None'}
          </Text>
          {deadline ? (
            <Pressable onPress={() => setDeadline(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear deadline">
              <Text style={[type.label, styles.clearText]}>Clear</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setCalendarOpen((open) => !open)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={calendarOpen ? 'Hide calendar' : 'Pick deadline'}
          >
            <Text style={[type.label, { color: accent.accent }]}>{calendarOpen ? 'Hide' : deadline ? 'Change' : 'Pick'}</Text>
          </Pressable>
        </View>
        {calendarOpen ? (
          <MonthCalendar
            selected={deadline}
            todayKey={todayKey}
            onSelect={(day) => {
              setDeadline(day);
              setCalendarOpen(false);
            }}
          />
        ) : null}
      </Field>

      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
        <Button label="Create goal" onPress={create} disabled={!canCreate} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 34, lineHeight: 38, letterSpacing: 1 },
  field: { gap: spacing.sm },
  target: { fontSize: 24 },
  deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 28 },
  deadlineText: { flex: 1, color: colors.text },
  clearText: { color: colors.accentStrong },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xs },
});
