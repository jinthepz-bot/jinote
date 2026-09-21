import { StyleSheet, Text, View } from 'react-native';

import { weekdayShort } from '../coach/days';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, radius, spacing } from '../design/theme';
import { EventRow } from './EventRow';
import type { DayItem } from './occurrences';
import { TaskRow } from './TaskRow';

interface Props {
  day: string;
  isToday: boolean;
  items: DayItem[];
  onEventPress: (id: string) => void;
  onTaskToggle: (id: string) => void;
  onTaskEdit: (id: string) => void;
}

// One day of the week view: a header (visually distinct when it's today) and its
// agenda — events and dated tasks together, in the order agendaForDay puts them in.
export function DayRow({ day, isToday, items, onEventPress, onTaskToggle, onTaskEdit }: Props) {
  const type = useType();
  const accent = useAccent();
  return (
    <View style={[styles.row, isToday && { backgroundColor: accent.accentSoft }]}>
      <View style={styles.header}>
        <Text style={[type.label, isToday && { color: accent.accent }]}>
          {weekdayShort(day).toUpperCase()} {Number(day.slice(8))}
        </Text>
        {isToday ? <Text style={[type.label, { color: accent.accent }]}>TODAY</Text> : null}
      </View>
      {items.length === 0 ? (
        <Text style={[type.mono, styles.empty]}>Nothing scheduled</Text>
      ) : (
        items.map((item) =>
          item.kind === 'event' ? (
            <EventRow key={item.id} event={item.event} onPress={() => onEventPress(item.id)} />
          ) : (
            <TaskRow
              key={item.id}
              task={item.task}
              onToggle={() => onTaskToggle(item.id)}
              onEdit={() => onTaskEdit(item.id)}
            />
          ),
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
    gap: spacing.xs / 2,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 18 },
  empty: { color: colors.textMuted, paddingVertical: spacing.sm },
});
