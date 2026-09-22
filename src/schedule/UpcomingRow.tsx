import { Pressable, StyleSheet, Text, View } from 'react-native';

import { daysBetween, formatDayKey } from '../coach/days';
import { hoverFill } from '../design/hover';
import { useType } from '../design/fonts';
import { describeEventTime } from './format';
import type { Occurrence } from './occurrences';

function dayLabel(date: string, todayKey: string): string {
  const n = daysBetween(todayKey, date);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return formatDayKey(date, todayKey);
}

// One upcoming occurrence, which (unlike EventRow) needs to say which day it's on.
export function UpcomingRow({ occurrence, todayKey, onPress }: { occurrence: Occurrence; todayKey: string; onPress: () => void }) {
  const type = useType();
  const { event, date } = occurrence;
  return (
    <Pressable
      onPress={onPress}
      style={(state) => [styles.row, hoverFill(state)]}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${event.title}`}
    >
      <View style={styles.body}>
        <Text style={type.bodyStrong} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={type.label} numberOfLines={1}>
          {dayLabel(date, todayKey)} · {describeEventTime(event)}
          {event.location ? ` · ${event.location}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 8 },
  pressed: { opacity: 0.6 },
  body: { gap: 1 },
});
