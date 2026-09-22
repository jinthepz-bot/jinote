import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { parseDayKey } from '../../coach/days';
import { useAccent } from '../../design/accent';
import { hoverFill, hoverStyles, pointerState } from '../../design/hover';
import { useType } from '../../design/fonts';
import { colors, radius, spacing } from '../../design/theme';
import type { CalendarItem } from './items';
import { gridLines, kindColors } from './kindColors';

const WEEK_HEADER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_PER_DAY = 3;

interface Props {
  weeks: string[][]; // whole weeks, Monday first, covering the month
  month: number; // 1-12, for greying out the leading and trailing days
  todayKey: string;
  itemsFor: (date: string) => CalendarItem[];
  onItemPress: (item: CalendarItem) => void;
  onDayPress: (date: string) => void;
}

export function MonthView({ weeks, month, todayKey, itemsFor, onItemPress, onDayPress }: Props) {
  const type = useType();
  const accent = useAccent();

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        {WEEK_HEADER.map((day) => (
          <View key={day} style={styles.headerCell}>
            <Text style={[type.label, styles.headerText]}>{day}</Text>
          </View>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {weeks.map((week) => (
          <View key={week[0]} style={styles.week}>
            {week.map((date) => {
              const items = itemsFor(date);
              const shown = items.slice(0, MAX_PER_DAY);
              const extra = items.length - shown.length;
              const isToday = date === todayKey;
              const outside = parseDayKey(date)?.month !== month;

              return (
                <View key={date} style={styles.dayCell}>
                  <Pressable
                    onPress={() => onDayPress(date)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${date}`}
                    style={(state) => [styles.dayNumberRow, hoverFill(state)]}
                  >
                    <View style={[styles.dayNumber, isToday && { backgroundColor: accent.accent }]}>
                      <Text
                        style={[
                          type.bodyStrong,
                          styles.dayNumberText,
                          outside && styles.outsideText,
                          isToday && { color: accent.onAccent },
                        ]}
                      >
                        {Number(date.slice(8))}
                      </Text>
                    </View>
                  </Pressable>

                  {shown.map((item) => {
                    const tint = kindColors(item.kind);
                    const clickable = item.source.kind === 'event' || item.source.kind === 'task';
                    return (
                      <Pressable
                        key={item.id}
                        onPress={clickable ? () => onItemPress(item) : undefined}
                        disabled={!clickable}
                        accessibilityRole={clickable ? 'button' : undefined}
                        accessibilityLabel={`${item.title}${item.timeLabel ? `, ${item.timeLabel}` : ''}`}
                        style={(state) => {
                          const { hovered } = pointerState(state);
                          const active = hovered && clickable;
                          return [
                            styles.item,
                            {
                              backgroundColor: active ? tint.backgroundHover : tint.background,
                              borderColor: tint.border,
                            },
                            clickable && hoverStyles.pointer,
                            active && hoverStyles.raised,
                            state.pressed && hoverStyles.pressedDim,
                          ];
                        }}
                      >
                        <Text
                          style={[type.body, styles.itemText, { color: tint.text }, item.done && styles.doneText]}
                          numberOfLines={1}
                        >
                          {item.timeLabel ? `${item.timeLabel} ` : ''}
                          {item.title}
                        </Text>
                      </Pressable>
                    );
                  })}

                  {extra > 0 ? (
                    <Pressable
                      onPress={() => onDayPress(date)}
                      accessibilityRole="button"
                      accessibilityLabel={`${extra} more on ${date}`}
                      style={(state) => [styles.more, hoverFill(state)]}
                    >
                      <Text style={[type.body, styles.moreText]}>+{extra} more</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: gridLines.hour },
  headerCell: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm },
  headerText: { fontSize: 10 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  week: { flexDirection: 'row', flex: 1, minHeight: 96, borderBottomWidth: 1, borderBottomColor: gridLines.hour },
  dayCell: { flex: 1, minWidth: 0, padding: 4, gap: 3, borderLeftWidth: 1, borderLeftColor: gridLines.hour },
  dayNumberRow: { alignItems: 'flex-start', borderRadius: radius.square },
  dayNumber: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  dayNumberText: { fontSize: 13 },
  outsideText: { color: colors.textMuted, opacity: 0.6 },
  item: { borderRadius: radius.square, borderWidth: 1, borderLeftWidth: 3, paddingHorizontal: 5, paddingVertical: 2 },
  itemText: { fontSize: 11, lineHeight: 15 },
  doneText: { textDecorationLine: 'line-through', opacity: 0.7 },
  more: { paddingHorizontal: 5, paddingVertical: 1 },
  moreText: { fontSize: 11, color: colors.textMuted },
  pressed: { opacity: 0.7 },
});
