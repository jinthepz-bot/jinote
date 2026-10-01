import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { hoverFill } from '../design/hover';
import { colors, radius, rgba, spacing } from '../design/theme';
import type { ActionRecord } from '../types';

// The desktop coach's receipts: one small card per change a reply made, under the
// reply — green check, the area in bold, what changed, and Undo where it's possible.
// Messages saved before receipts existed have only a label; they show that instead.
export function ActionReceipts({ actions, onUndo }: { actions: ActionRecord[]; onUndo?: (index: number) => void }) {
  const type = useType();
  const accent = useAccent();
  if (actions.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {actions.map((action, i) => (
        <View key={i} style={[styles.card, action.undone && styles.undone]} accessibilityRole="summary">
          <View style={[styles.check, action.undone && styles.checkUndone]}>
            <Ionicons name={action.undone ? 'arrow-undo' : 'checkmark'} size={12} color={colors.surface} />
          </View>
          <Text style={[type.body, styles.text, action.undone && styles.struck]} numberOfLines={2}>
            {action.area ? (
              <>
                <Text style={type.bodyStrong}>{action.area}</Text>
                {` · ${action.detail ?? action.label}`}
              </>
            ) : (
              action.label
            )}
          </Text>
          {action.undone ? (
            <Text style={[type.body, styles.undoneLabel]}>Undone</Text>
          ) : action.undo && onUndo ? (
            <Pressable
              onPress={() => onUndo(i)}
              accessibilityRole="button"
              accessibilityLabel={`Undo: ${action.label}`}
              style={(s) => [styles.undo, hoverFill(s)]}
            >
              <Text style={[type.bodyStrong, styles.undoText, { color: accent.accent }]}>Undo</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, marginTop: 2, marginBottom: 6, maxWidth: '92%' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.sm,
    paddingRight: 4,
    paddingVertical: 5,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: rgba(colors.goalGreen, 0.35),
    backgroundColor: rgba(colors.goalGreen, 0.07),
  },
  undone: { borderColor: colors.border, backgroundColor: 'transparent' },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.goalGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkUndone: { backgroundColor: colors.textMuted },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
  struck: { color: colors.textMuted, textDecorationLine: 'line-through' },
  undo: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.control },
  undoText: { fontSize: 13 },
  undoneLabel: { fontSize: 12, color: colors.textMuted, paddingHorizontal: spacing.sm },
});
