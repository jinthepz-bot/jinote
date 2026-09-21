import { StyleSheet, Text, View } from 'react-native';

import { useType } from '../design/fonts';
import { colors, spacing } from '../design/theme';
import { Card } from '../design/ui';
import { describeEventTime } from '../schedule/format';
import type { ScheduleEvent } from '../schedule/store';

const MAX_SHOWN = 3;

// Compact "what's on today" strip for Home — the full week view lives on Schedule.
export function TodayStrip({ events }: { events: ScheduleEvent[] }) {
  const type = useType();

  if (events.length === 0) {
    return (
      <Card style={styles.card}>
        <Text style={[type.body, styles.empty]}>Nothing scheduled today.</Text>
      </Card>
    );
  }

  const shown = events.slice(0, MAX_SHOWN);
  const extra = events.length - shown.length;

  return (
    <Card style={styles.card}>
      {shown.map((event, i) => (
        <View key={event.id} style={[styles.row, i > 0 && styles.divider]}>
          <Text style={[type.mono, styles.time]}>{describeEventTime(event)}</Text>
          <Text style={[type.body, styles.title]} numberOfLines={1}>
            {event.title}
          </Text>
        </View>
      ))}
      {extra > 0 ? <Text style={[type.label, styles.more]}>+{extra} more today</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  empty: { color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 2 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 2 },
  time: { width: 44, color: colors.text },
  title: { flex: 1 },
  more: { marginTop: 2 },
});
