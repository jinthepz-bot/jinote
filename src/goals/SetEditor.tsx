import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';

import { formatAmount, parseAmount, sanitizeAmountInput } from '../coach/format';
import { deleteEntry, updateEntry, type LogEntry } from '../coach/store';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { hoverDim, hoverFill } from '../design/hover';
import { colors, keyboardAppearance, radius, sizes, spacing } from '../design/theme';

const noOutline = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;

// Change one logged set's size, or delete it — from Today's set chips and the
// History list on Goals. The goal's record is recalculated either way (see
// updateEntry and deleteEntry).
export function SetEditor({ set, unit, title, onDone }: { set: LogEntry; unit: string; title: string; onDone: () => void }) {
  const type = useType();
  const accent = useAccent();
  const [text, setText] = useState(formatAmount(set.value));
  const value = parseAmount(text);
  const canSave = value !== null && value > 0;

  const save = () => {
    if (!canSave) return;
    if (value !== set.value) updateEntry(set.id, value);
    onDone();
  };

  return (
    <View style={styles.editor}>
      <Text style={[type.bodyStrong, styles.editorTitle]}>{title}</Text>
      <View style={styles.editorRow}>
        <TextInput
          style={[type.number, styles.editorInput, noOutline]}
          value={text}
          onChangeText={(t) => setText(sanitizeAmountInput(t))}
          keyboardType="decimal-pad"
          keyboardAppearance={keyboardAppearance}
          autoFocus
          selectTextOnFocus
          onSubmitEditing={save}
          accessibilityLabel="Set size"
        />
        {unit ? <Text style={[type.body, styles.muted]}>{unit}</Text> : null}
      </View>
      <View style={styles.editorActions}>
        <Pressable
          onPress={() => {
            deleteEntry(set.id);
            onDone();
          }}
          accessibilityRole="button"
          accessibilityLabel="Delete this set"
          style={(s) => [styles.editorButton, hoverFill(s)]}
        >
          <Ionicons name="trash-outline" size={15} color={colors.deadlineRed} />
          <Text style={[type.bodyStrong, styles.deleteText]}>Delete</Text>
        </Pressable>
        <View style={styles.flex} />
        <Pressable
          onPress={save}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel="Save set"
          style={(s) => [styles.editorButton, { backgroundColor: accent.accent }, !canSave && styles.disabled, canSave && hoverDim(s)]}
        >
          <Text style={[type.bodyStrong, { color: accent.onAccent }]}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  muted: { color: colors.textMuted },
  editor: { padding: spacing.md, gap: spacing.sm },
  editorTitle: { fontSize: 14 },
  editorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editorInput: {
    flex: 1,
    minWidth: 0,
    height: sizes.control,
    fontSize: 22,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    backgroundColor: colors.background,
    color: colors.text,
  },
  editorActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: sizes.controlSm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
  },
  deleteText: { fontSize: 14, color: colors.deadlineRed },
  disabled: { opacity: 0.45 },
});
