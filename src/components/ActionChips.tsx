import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useType } from '../design/fonts';
import { colors, spacing } from '../design/theme';
import type { ActionKind, ActionRecord } from '../types';

const GLYPHS: Record<ActionKind, string> = {
  progress_logged: '▲',
  goal_created: '★',
  deadline_set: '◷',
  task_added: '+',
  task_completed: '✓',
  buy_added: '+',
  buy_bought: '✓',
  journal_saved: '✎',
  event_added: '▤',
  event_deleted: '✕',
  event_moved: '↦',
  note_saved: '✎',
  recipe_saved: '▦',
};

export function ActionChips({ actions, style }: { actions: ActionRecord[]; style?: StyleProp<ViewStyle> }) {
  const type = useType();
  if (actions.length === 0) return null;
  return (
    <View style={[styles.wrap, style]}>
      {actions.map((action, i) => (
        <View key={i} style={styles.chip}>
          <Text style={[type.mono, styles.glyph]}>{GLYPHS[action.kind] ?? '•'}</Text>
          <Text style={[type.body, styles.label]}>{action.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, marginVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    maxWidth: '85%',
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  glyph: { width: 16, fontSize: 13, lineHeight: 18, color: colors.success },
  label: { flexShrink: 1, fontSize: 13, lineHeight: 18 },
});
