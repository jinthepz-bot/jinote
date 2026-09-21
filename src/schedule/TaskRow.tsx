import { StyleSheet, Text, View } from 'react-native';

import type { Task } from '../coach/store';
import { useType } from '../design/fonts';
import { colors, spacing } from '../design/theme';
import { Checkbox, RowIconButton } from '../design/ui';

interface Props {
  task: Task;
  onToggle: () => void;
  onEdit: () => void; // opens the full form to change its text, date, or time
}

// One dated task, shown alongside events for a day it's due on (see EventRow,
// which this mirrors). Tapping the row toggles it done, same as the Home task
// list; the trailing icon opens the full edit form, same as EventRow's whole-row tap.
export function TaskRow({ task, onToggle, onEdit }: Props) {
  const type = useType();
  return (
    <View style={styles.row}>
      <Text style={[type.mono, styles.time]}>{task.time ?? ''}</Text>
      <Checkbox checked={task.done} onPress={onToggle} label={task.text} size={20} />
      <Text
        style={[type.body, styles.title, task.done && styles.titleDone]}
        numberOfLines={1}
        onPress={onToggle}
      >
        {task.text}
      </Text>
      <RowIconButton icon="calendar-outline" label={`Edit ${task.text}`} onPress={onEdit} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  time: { width: 44, color: colors.text },
  title: { flex: 1 },
  titleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
});
