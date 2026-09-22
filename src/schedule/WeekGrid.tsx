import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { weekdayShort } from '../coach/days';
import { hoverDim } from '../design/hover';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, radius } from '../design/theme';
import type { AccentPalette } from '../design/theme';
import { minutesOf } from './time';
import type { EventColor, ScheduleEvent } from './store';

const START_HOUR = 0;
const END_HOUR = 24;
const HOUR_HEIGHT = 56;
const TIME_WIDTH = 48;
const MIN_DAY_WIDTH = 100;

// An event's colour choice is stored as a role ("accent", "soft"), not a hex, so
// every event follows the accent the user picks in Settings.
function blockColors(
  accent: AccentPalette,
): Record<EventColor, { backgroundColor: string; borderColor: string; textColor: string }> {
  return {
    accent: { backgroundColor: accent.accent, borderColor: accent.accent, textColor: accent.onAccent },
    soft: { backgroundColor: accent.accentSoft, borderColor: accent.accent, textColor: colors.text },
    strong: { backgroundColor: colors.accentStrongSoft, borderColor: colors.accentStrong, textColor: colors.text },
    success: { backgroundColor: colors.successSoft, borderColor: colors.success, textColor: colors.text },
  };
}

interface PositionedEvent {
  event: ScheduleEvent;
  column: number;
  columns: number;
  top: number;
  height: number;
}

function positionedEvents(events: ScheduleEvent[]): PositionedEvent[] {
  const sorted = [...events].sort((a, b) => minutesOf(a.startTime) - minutesOf(b.startTime));
  const columns: number[] = [];
  const positioned: PositionedEvent[] = [];

  for (const event of sorted) {
    const start = minutesOf(event.startTime);
    const end = Math.max(start + 30, event.endTime ? minutesOf(event.endTime) : start + 60);
    let column = columns.findIndex((lastEnd) => lastEnd <= start);
    if (column < 0) column = columns.length;
    columns[column] = end;
    positioned.push({
      event,
      column,
      columns: 1,
      top: (start / 60 - START_HOUR) * HOUR_HEIGHT,
      height: Math.max(28, ((end - start) / 60) * HOUR_HEIGHT),
    });
  }

  for (const item of positioned) {
    const start = minutesOf(item.event.startTime);
    const end = Math.max(start + 30, item.event.endTime ? minutesOf(item.event.endTime) : start + 60);
    item.columns = Math.max(
      1,
      positioned.filter((other) => {
        const otherStart = minutesOf(other.event.startTime);
        const otherEnd = Math.max(otherStart + 30, other.event.endTime ? minutesOf(other.event.endTime) : otherStart + 60);
        return otherStart < end && otherEnd > start;
      }).length,
    );
  }
  return positioned;
}

function EventBlock({ item, onPress }: { item: PositionedEvent; onPress: () => void }) {
  const type = useType();
  const accent = useAccent();
  const palette = blockColors(accent)[item.event.color];
  return (
    <Pressable
      onPress={onPress}
      style={(state) => [
        styles.event,
        palette,
        {
          top: item.top + 2,
          height: item.height - 4,
          left: `${(item.column * 100) / item.columns}%`,
          width: `${100 / item.columns}%`,
        },
        hoverDim(state),
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.event.title}`}
    >
      <Text style={[type.bodyStrong, styles.eventText, { color: palette.textColor }]} numberOfLines={2}>
        {item.event.title}
      </Text>
      {item.height >= 58 && item.event.location ? (
        <Text style={[type.mono, styles.eventLocationText, { color: palette.textColor }]} numberOfLines={1}>
          {item.event.location}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function WeekGrid({
  days,
  todayKey,
  events,
  onEventPress,
}: {
  days: string[];
  todayKey: string;
  events: ScheduleEvent[];
  onEventPress: (id: string) => void;
}) {
  const type = useType();
  const accent = useAccent();
  const { width } = useWindowDimensions();
  const gridWidth = Math.max(width - 32, TIME_WIDTH + MIN_DAY_WIDTH * 7);
  const bodyHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const showCurrentLine = days.includes(todayKey) && currentMinutes >= START_HOUR * 60 && currentMinutes <= END_HOUR * 60;

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
      <View style={styles.body}>
        <View style={[styles.timeColumn, { height: bodyHeight }]}>
          {Array.from({ length: END_HOUR - START_HOUR }, (_, index) => (
            <Text key={index} style={[type.mono, styles.hour, { top: index * HOUR_HEIGHT - 7 }]}>
              {String(index + START_HOUR).padStart(2, '0')}:00
            </Text>
          ))}
        </View>
        <View style={[styles.days, { height: bodyHeight }]}>
          {days.map((day) => {
            const isToday = day === todayKey;
            const dayEvents = events.filter((event) => {
              if (event.type === 'one-off') return event.date === day;
              const weekday = new Date(`${day}T12:00:00`).getDay();
              return event.days.includes(weekday) && (!event.startDate || day >= event.startDate) && (!event.endDate || day <= event.endDate);
            });
            return (
              <View key={day} style={[styles.dayColumn, isToday && { backgroundColor: accent.accentSoft }]}>
                {Array.from({ length: END_HOUR - START_HOUR }, (_, index) => (
                  <View key={index} style={[styles.hourLine, { top: index * HOUR_HEIGHT }]} />
                ))}
                {positionedEvents(dayEvents).map((item) => (
                  <EventBlock key={item.event.id} item={item} onPress={() => onEventPress(item.event.id)} />
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
  body: { flexDirection: 'row' },
  timeColumn: { width: TIME_WIDTH, position: 'relative' },
  hour: { position: 'absolute', right: 6, color: colors.textMuted, fontSize: 9 },
  days: { flex: 1, flexDirection: 'row' },
  dayColumn: { flex: 1, minWidth: MIN_DAY_WIDTH, position: 'relative', borderLeftWidth: 1, borderLeftColor: colors.border },
  hourLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderTopColor: colors.border },
  event: { position: 'absolute', padding: 5, borderLeftWidth: 3, borderRadius: radius.control, overflow: 'hidden' },
  eventText: { fontSize: 11 },
  eventLocationText: { fontSize: 9, marginTop: 2 },
  pressed: { opacity: 0.7 },
  currentLine: { position: 'absolute', left: -1, right: 0, borderTopWidth: 2, borderTopColor: colors.accentStrong, zIndex: 3 },
});