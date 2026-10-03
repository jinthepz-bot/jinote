import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { weekdayShort } from '../coach/days';
import { hoverDim } from '../design/hover';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, radius } from '../design/theme';
import { allDayItems, layoutDay, spanOf, type CalendarItem, type PositionedItem } from './calendar/items';
import { kindColors } from './calendar/kindColors';

const START_HOUR = 0;
const END_HOUR = 24;
const HOUR_HEIGHT = 56;
const TIME_WIDTH = 48;
const MIN_DAY_WIDTH = 100;

// The phone's week: the same items as the desktop calendar (events, dated tasks, goal
// sessions and deadlines), in the same kind colours (see calendar/kindColors), so a
// blue block is an event and a green one a session on either screen.

function ItemBlock({ positioned, onPress }: { positioned: PositionedItem; onPress?: () => void }) {
  const type = useType();
  const { item, lane, lanes } = positioned;
  const tint = kindColors(item.kind);
  const { start, end } = spanOf(item);
  const top = ((start - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(28, ((end - start) / 60) * HOUR_HEIGHT);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={(state) => [
        styles.block,
        {
          top: top + 2,
          height: height - 4,
          left: `${(lane * 100) / lanes}%`,
          width: `${100 / lanes}%`,
          backgroundColor: tint.background,
          borderColor: tint.border,
        },
        item.done && styles.done,
        onPress && hoverDim(state),
      ]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `Edit ${item.title}` : `${item.title}${item.timeLabel ? `, ${item.timeLabel}` : ''}`}
    >
      <Text
        style={[type.bodyStrong, styles.blockText, { color: tint.text }, item.done && styles.doneText]}
        numberOfLines={2}
      >
        {item.title}
      </Text>
      {height >= 58 && item.source.kind === 'event' && item.source.event.location ? (
        <Text style={[type.mono, styles.blockLocation, { color: tint.text }]} numberOfLines={1}>
          {item.source.event.location}
        </Text>
      ) : null}
    </Pressable>
  );
}

// A deadline, an untimed task or a set logged without a time: a pill above the hours.
function AllDayPill({ item, onPress }: { item: CalendarItem; onPress?: () => void }) {
  const type = useType();
  const tint = kindColors(item.kind);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={(state) => [
        styles.pill,
        { backgroundColor: tint.background, borderColor: tint.border },
        item.done && styles.done,
        onPress && hoverDim(state),
      ]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `Edit ${item.title}` : item.title}
    >
      <Text style={[type.bodyStrong, styles.pillText, { color: tint.text }, item.done && styles.doneText]} numberOfLines={1}>
        {item.title}
      </Text>
    </Pressable>
  );
}

export function WeekGrid({
  days,
  todayKey,
  itemsByDay,
  onEventPress,
  onTaskPress,
}: {
  days: string[];
  todayKey: string;
  itemsByDay: CalendarItem[][]; // parallel to `days`
  onEventPress: (id: string) => void;
  onTaskPress: (id: string) => void;
}) {
  const type = useType();
  const accent = useAccent();
  const { width } = useWindowDimensions();
  const gridWidth = Math.max(width - 32, TIME_WIDTH + MIN_DAY_WIDTH * 7);
  const bodyHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const showCurrentLine = days.includes(todayKey) && currentMinutes >= START_HOUR * 60 && currentMinutes <= END_HOUR * 60;
  const allDay = itemsByDay.map(allDayItems);
  const hasAllDay = allDay.some((items) => items.length > 0);

  // Sessions and deadlines have no form of their own, as on the desktop calendar.
  const pressFor = (item: CalendarItem) => {
    const source = item.source;
    if (source.kind === 'event') return () => onEventPress(source.event.id);
    if (source.kind === 'task') return () => onTaskPress(source.task.id);
    return undefined;
  };

  return (
    <View style={[styles.grid, { width: gridWidth }]}>
      <View style={styles.headerRow}>
        <View style={styles.timeHeader} />
        {days.map((day) => {
          const isToday = day === todayKey;
          return (
            <View key={day} style={[styles.dayHeader, isToday && { backgroundColor: accent.accentSoft }]}>
              <Text style={[type.label, isToday && { color: accent.accent }]}>{weekdayShort(day).toUpperCase()}</Text>
              <Text style={[type.mono, styles.dayNumber, isToday && { color: accent.accent }]}>
                {Number(day.slice(8))}
              </Text>
            </View>
          );
        })}
      </View>
      {hasAllDay ? (
        <View style={styles.allDayRow}>
          <View style={styles.timeHeader} />
          {days.map((day, i) => (
            <View key={day} style={styles.allDayCell}>
              {allDay[i].map((item) => (
                <AllDayPill key={item.id} item={item} onPress={pressFor(item)} />
              ))}
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.body}>
        <View style={[styles.timeColumn, { height: bodyHeight }]}>
          {Array.from({ length: END_HOUR - START_HOUR }, (_, index) => (
            <Text key={index} style={[type.mono, styles.hour, { top: index * HOUR_HEIGHT - 7 }]}>
              {String(index + START_HOUR).padStart(2, '0')}:00
            </Text>
          ))}
        </View>
        <View style={[styles.days, { height: bodyHeight }]}>
          {days.map((day, i) => {
            const isToday = day === todayKey;
            return (
              <View key={day} style={[styles.dayColumn, isToday && { backgroundColor: accent.accentSoft }]}>
                {Array.from({ length: END_HOUR - START_HOUR }, (_, index) => (
                  <View key={index} style={[styles.hourLine, { top: index * HOUR_HEIGHT }]} />
                ))}
                {layoutDay(itemsByDay[i]).map((positioned) => (
                  <ItemBlock key={positioned.item.id} positioned={positioned} onPress={pressFor(positioned.item)} />
                ))}
                {isToday && showCurrentLine ? <View style={[styles.currentLine, { top: (currentMinutes / 60) * HOUR_HEIGHT }]} /> : null}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { minWidth: TIME_WIDTH + MIN_DAY_WIDTH * 7 },
  headerRow: { flexDirection: 'row', height: 46, borderBottomWidth: 1, borderBottomColor: colors.border },
  timeHeader: { width: TIME_WIDTH },
  dayHeader: { flex: 1, minWidth: MIN_DAY_WIDTH, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayNumber: { fontSize: 13, color: colors.textMuted },
  allDayRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 3 },
  allDayCell: { flex: 1, minWidth: MIN_DAY_WIDTH, gap: 2, paddingHorizontal: 2 },
  pill: { borderWidth: 1, borderLeftWidth: 3, borderRadius: radius.control, paddingHorizontal: 4, paddingVertical: 2 },
  pillText: { fontSize: 10 },
  body: { flexDirection: 'row' },
  timeColumn: { width: TIME_WIDTH, position: 'relative' },
  hour: { position: 'absolute', right: 6, color: colors.textMuted, fontSize: 9 },
  days: { flex: 1, flexDirection: 'row' },
  dayColumn: { flex: 1, minWidth: MIN_DAY_WIDTH, position: 'relative', borderLeftWidth: 1, borderLeftColor: colors.border },
  hourLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderTopColor: colors.border },
  block: {
    position: 'absolute',
    padding: 5,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: radius.control,
    overflow: 'hidden',
  },
  blockText: { fontSize: 11 },
  blockLocation: { fontSize: 9, marginTop: 2 },
  done: { opacity: 0.55 },
  doneText: { textDecorationLine: 'line-through' },
  // The same red as the desktop calendar's "now" line.
  currentLine: { position: 'absolute', left: -1, right: 0, borderTopWidth: 2, borderTopColor: colors.deadlineRed, zIndex: 3 },
});
