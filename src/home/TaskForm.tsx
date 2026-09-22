import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { describeDayDistance, formatDayKey } from '../coach/days';
import type { Task, TaskEdit } from '../coach/store';
import { confirmDestructive } from '../design/confirm';
import { useType } from '../design/fonts';
import { Sheet } from '../design/Sheet';
import { colors, spacing, keyboardAppearance } from '../design/theme';
import { useAccent } from '../design/accent';
import { Button, fieldStyles } from '../design/ui';
import { isTimeKey, sanitizeTimeInput } from '../schedule/time';
import { MonthCalendar } from './MonthCalendar';

interface Props {
  visible: boolean;
  todayKey: string;
  editing: Task | null; // null = creating a new task
  initialText?: string; // creating only: carries over whatever was already typed
  initialDate?: string; // creating only: the day in view on the desktop calendar
  onCancel: () => void;
  onSave: (input: TaskEdit) => void;
  onDelete?: () => void;
}

export function TaskForm({ visible, onCancel, ...rest }: Props) {
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

function FormBody({ todayKey, editing, initialText, initialDate, onCancel, onSave, onDelete }: Omit<Props, 'visible'>) {
  const type = useType();
  const accent = useAccent();
  const [text, setText] = useState(editing?.text ?? initialText ?? '');
  const [date, setDate] = useState<string | null>(editing?.date ?? initialDate ?? null);
  const [time, setTime] = useState(editing?.time ?? '');
  const [calendarOpen, setCalendarOpen] = useState(false);

  const timeValid = time.trim() === '' || isTimeKey(time);
  const canSave = text.trim() !== '' && timeValid;

  const save = () => {
    if (!canSave) return;
    onSave({ text: text.trim(), date, time: date && time.trim() !== '' ? time : null });
  };

  const confirmDelete = () => {
    if (!onDelete) return;
    confirmDestructive({
      title: `Delete "${text.trim() || 'this task'}"?`,
      confirmLabel: 'Delete',
      onConfirm: onDelete,
    });
  };

  return (
    <>
      <Text style={[type.display, styles.heading]}>{editing ? 'EDIT TASK' : 'NEW TASK'}</Text>

      <Field label="Task">
        <TextInput
          style={[fieldStyles.input, fieldStyles.single, type.body]}
          value={text}
          onChangeText={setText}
          placeholder="e.g. Email my professor"
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={keyboardAppearance}
          autoFocus
          accessibilityLabel="Task text"
        />
      </Field>

      <Field label="Date (optional)">
        <View style={styles.dateRow}>
          <Text style={[type.mono, styles.dateText]}>
            {date ? `${formatDayKey(date, todayKey)} · ${describeDayDistance(todayKey, date)}` : 'None · plain task'}
          </Text>
          {date ? (
            <Pressable
              onPress={() => {
                setDate(null);
                setTime('');
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear date"
            >
              <Text style={[type.label, styles.clearText]}>Clear</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setCalendarOpen((open) => !open)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={calendarOpen ? 'Hide calendar' : 'Pick date'}
          >
            <Text style={[type.label, { color: accent.accent }]}>{calendarOpen ? 'Hide' : date ? 'Change' : 'Pick'}</Text>
          </Pressable>
        </View>
        {calendarOpen ? (
          <MonthCalendar
            selected={date}
            todayKey={todayKey}
            onSelect={(day) => {
              setDate(day);
              setCalendarOpen(false);
            }}
          />
        ) : null}
      </Field>

      {date ? (
        <Field label="Time (optional)">
          <TextInput
            style={[fieldStyles.input, fieldStyles.single, type.mono, styles.timeInput, !timeValid && styles.invalid]}
            value={time}
            onChangeText={(t) => setTime(sanitizeTimeInput(t))}
            placeholder="14:00"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            keyboardAppearance={keyboardAppearance}
            accessibilityLabel="Task time"
          />
        </Field>
      ) : null}

      <Text style={[type.mono, styles.hint]}>
        {date ? 'Shows on the Schedule screen for that day.' : 'Plain tasks stay on Home.'}
      </Text>

      <View style={styles.actions}>
        <View style={styles.actionsStart}>
          {onDelete ? (
            <Pressable onPress={confirmDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete task">
              <Text style={[type.label, styles.deleteText]}>Delete</Text>
            </Pressable>
          ) : null}
        </View>
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
        <Button label="Save" onPress={save} disabled={!canSave} accessibilityLabel="Save task" />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 34, lineHeight: 38, letterSpacing: 1 },
  field: { gap: spacing.sm },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 28 },
  dateText: { flex: 1, color: colors.text },
  clearText: { color: colors.accentStrong },
  timeInput: { width: 110 },
  invalid: { borderColor: colors.accentStrong },
  hint: { color: colors.textMuted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  actionsStart: { flex: 1, alignItems: 'flex-start' },
  deleteText: { color: colors.accentStrong },
});
