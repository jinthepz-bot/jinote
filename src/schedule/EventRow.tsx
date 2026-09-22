import { Pressable, StyleSheet, Text, View } from 'react-native';

import { hoverFill } from '../design/hover';
import { useType } from '../design/fonts';
import { colors, spacing } from '../design/theme';
import { describeEventTime } from './format';
import type { ScheduleEvent } from './store';

// One event, shown within a day it's already known to occur on (its own date/days
// aren't repeated here — see UpcomingRow for a row that needs to say which day too).
export function EventRow({ event, onPress }: { event: ScheduleEvent; onPress: () => void }) {
  const type = useType();
  return (
    <Pressable
      onPress={onPress}
      style={(state) => [styles.row, hoverFill(state)]}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${event.title}`}
    >
      <Text style={[type.mono, styles.time]}>{describeEventTime(event)}</Text>
      <View style={styles.body}>
        <Text style={type.bodyStrong} numberOfLines={1}>
          {event.title}
        </Text>
        {event.location ? (
          <Text style={type.label} numberOfLines={1}>
            {event.location}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: 8 },
  pressed: { opacity: 0.6 },
  time: { width: 44, color: colors.text, paddingTop: 2 },
  body: { flex: 1, gap: 1 },
});
