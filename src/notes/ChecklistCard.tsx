import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { confirmDestructive } from '../design/confirm';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, radius, sizes, spacing, keyboardAppearance } from '../design/theme';
import { Card, Checkbox, IconButton, RowIconButton } from '../design/ui';
import { addChecklistItem, deleteChecklistItem, deleteNote, toggleChecklistItem, type ChecklistNote } from './store';

export function ChecklistCard({ note }: { note: ChecklistNote }) {
  const type = useType();
  const accent = useAccent();
  const [draft, setDraft] = useState('');
  const canAdd = draft.trim() !== '';
  const doneCount = note.items.filter((i) => i.done).length;

  const add = () => {
    if (!canAdd) return;
    addChecklistItem(note.id, draft);
    setDraft('');
  };

  const confirmDelete = () =>
    confirmDestructive({
      title: `Delete "${note.title}"?`,
      confirmLabel: 'Delete',
      onConfirm: () => deleteNote(note.id),
    });

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={type.bodyStrong} numberOfLines={2}>
          {note.title}
        </Text>
        <View style={styles.headerRight}>
          <Text style={type.label}>
            {doneCount}/{note.items.length}
          </Text>
          <IconButton icon="trash-outline" label={`Delete checklist "${note.title}"`} onPress={confirmDelete} />
        </View>
      </View>

      {note.items.length === 0 ? (
        <Text style={[type.body, styles.empty]}>No items yet.</Text>
      ) : (
        note.items.map((item, i) => (
          <View key={item.id} style={[styles.row, i > 0 && styles.divider]}>
            <Checkbox
              checked={item.done}
              onPress={() => toggleChecklistItem(note.id, item.id)}
              label={item.text}
            />
            <Text
              style={[type.body, styles.itemText, item.done && styles.itemDone]}
              onPress={() => toggleChecklistItem(note.id, item.id)}
            >
              {item.text}
            </Text>
            <RowIconButton
              icon="trash-outline"
              label={`Delete item "${item.text}"`}
              onPress={() => deleteChecklistItem(note.id, item.id)}
            />
          </View>
        ))
      )}

      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, type.body]}
          value={draft}
          onChangeText={setDraft}
          placeholder="Add an item"
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={keyboardAppearance}
          returnKeyType="done"
          onSubmitEditing={add}
          submitBehavior="submit"
          accessibilityLabel={`Add item to "${note.title}"`}
        />
        <Pressable
          onPress={add}
          disabled={!canAdd}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: accent.accent },
            !canAdd && styles.disabled,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add item"
        >
          <Ionicons name="add" size={22} color={accent.onAccent} />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  empty: { color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  itemText: { flex: 1 },
  itemDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  pressed: { opacity: 0.6 },
  addRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  input: {
    flex: 1,
    minWidth: 0,
    height: sizes.control,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
  addButton: {
    width: sizes.control,
    height: sizes.control,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
});
