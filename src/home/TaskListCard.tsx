import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Task } from '../coach/store';
import { hoverDim, hoverFill } from '../design/hover';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, radius, sizes, spacing, keyboardAppearance } from '../design/theme';
import { Card, Checkbox, RowIconButton } from '../design/ui';

interface Props {
  tasks: Task[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (text: string) => void;
  onEdit: (id: string) => void; // opens the full form (text, date, time) for an existing task
  onSchedule: (draftText: string) => void; // opens the full form to create one, carrying over what's typed
}

export function TaskListCard({ tasks, onToggle, onDelete, onAdd, onEdit, onSchedule }: Props) {
  const type = useType();
  const accent = useAccent();
  const [draft, setDraft] = useState('');
  const canAdd = draft.trim() !== '';

  const add = () => {
    if (!canAdd) return;
    onAdd(draft.trim());
    setDraft('');
  };

  // The scheduler takes over the draft, same as adding does, so it can't also be
  // submitted plain by a stray tap on "+" once the sheet is open.
  const schedule = () => {
    onSchedule(draft.trim());
    setDraft('');
  };

  return (
    <Card style={styles.card}>
      {tasks.length === 0 ? (
        <Text style={[type.body, styles.empty]}>No tasks yet. Add one below.</Text>
      ) : (
        tasks.map((task, i) => (
          <View key={task.id} style={[styles.row, i > 0 && styles.divider]}>
            <Checkbox checked={task.done} onPress={() => onToggle(task.id)} label={task.text} />
            <Text style={[type.body, styles.title, task.done && styles.titleDone]} onPress={() => onToggle(task.id)}>
              {task.text}
            </Text>
            <RowIconButton
              icon="calendar-outline"
              label={`Set date and time for ${task.text}`}
              onPress={() => onEdit(task.id)}
            />
            <RowIconButton icon="trash-outline" label={`Delete ${task.text}`} onPress={() => onDelete(task.id)} />
          </View>
        ))
      )}

      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, type.body]}
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a task"
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={keyboardAppearance}
          returnKeyType="done"
          onSubmitEditing={add}
          submitBehavior="submit"
          accessibilityLabel="New task"
        />
        <Pressable
          onPress={schedule}
          style={(state) => [styles.addButton, styles.scheduleButton, hoverFill(state)]}
          accessibilityRole="button"
          accessibilityLabel="Add a task with a date and time"
        >
          <Ionicons name="calendar-outline" size={20} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={add}
          disabled={!canAdd}
          style={(state) => [
            styles.addButton,
            { backgroundColor: accent.accent },
            !canAdd && styles.disabled,
            canAdd && hoverDim(state),
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add task"
        >
          <Ionicons name="add" size={22} color={accent.onAccent} />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, overflow: 'hidden' },
  empty: { color: colors.textMuted, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  title: { flex: 1 },
  titleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  pressed: { opacity: 0.6 },
  addRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface2,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: sizes.control,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
  },
  addButton: {
    width: sizes.control,
    height: sizes.control,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  disabled: { opacity: 0.45 },
});
