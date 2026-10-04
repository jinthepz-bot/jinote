import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDayKey, formatTime } from '../coach/days';
import { formatAmount } from '../coach/format';
import { bestLoggedSet, dayTotal, recordSet, setHistory } from '../coach/progress';
import { resetRecordToSets, type CoachState, type Goal, type LogEntry } from '../coach/store';
import { useAccent } from '../design/accent';
import { confirmDestructive } from '../design/confirm';
import { useType } from '../design/fonts';
import { hoverFill } from '../design/hover';
import { Popover, type PopoverAnchor } from '../design/Popover';
import { colors, radius, rgba, spacing } from '../design/theme';
import { Button, Card } from '../design/ui';
import { SetEditor } from './SetEditor';

const DAYS_PAGE = 14; // days shown at first, and added by "Show earlier days"
const EDITOR_WIDTH = 220;

// Goals → History: every logged set of a goal, by day, newest first, as "time · reps".
// Tap a set to change its size or delete it; a record goal's number is recalculated
// from what's left (so deleting a mistaken 90 brings the record back to the real best).
export function SetHistory({ state, todayKey }: { state: CoachState; todayKey: string }) {
  const type = useType();
  const accent = useAccent();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [days, setDays] = useState(DAYS_PAGE);

  const withSets = state.goals.filter((g) => state.entries.some((e) => e.goalId === g.id));
  const goal = withSets.find((g) => g.id === pickedId) ?? withSets.find((g) => g.featured) ?? withSets[0];
  if (!goal) {
    return (
      <Card>
        <Text style={[type.body, styles.muted]}>No sets logged yet.</Text>
      </Card>
    );
  }

  const history = setHistory(state, goal.id);
  const record = recordSet(goal, state);
  const best = bestLoggedSet(state, goal.id);
  const unit = goal.unit || (goal.type === 'best' ? 'reps' : '');
  const unitText = unit ? ` ${unit}` : '';
  // A record no set backs up: from before sets were logged, or its set is gone.
  const recordWithoutSet = goal.type === 'best' && goal.current > best;

  return (
    <View style={styles.root}>
      {withSets.length > 1 ? (
        <View style={styles.chips} accessibilityRole="radiogroup">
          {withSets.map((g) => {
            const selected = g.id === goal.id;
            return (
              <Pressable
                key={g.id}
                onPress={() => {
                  setPickedId(g.id);
                  setDays(DAYS_PAGE);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`History of ${g.title}`}
                style={(s) => [styles.chip, selected && { backgroundColor: accent.accent, borderColor: accent.accent }, !selected && hoverFill(s)]}
              >
                <Text style={[type.body, styles.chipText, selected && { color: accent.onAccent }]} numberOfLines={1}>
                  {g.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {recordWithoutSet ? (
        <Card style={styles.notice}>
          <Text style={type.body}>
            The record says {formatAmount(goal.current)}, but the best logged set is {formatAmount(best)}
            {unitText}.
          </Text>
          <Button
            label={`Set record to ${formatAmount(best)}`}
            small
            variant="secondary"
            onPress={() =>
              confirmDestructive({
                title: `Set the record to ${formatAmount(best)}?`,
                message: `"${goal.title}" goes from ${formatAmount(goal.current)} to ${formatAmount(best)}, its best logged set.`,
                confirmLabel: 'Set record',
                onConfirm: () => resetRecordToSets(goal.id),
              })
            }
          />
        </Card>
      ) : null}

      <Card style={styles.list}>
        {history.slice(0, days).map(({ date, sets }, index) => (
          <View key={date} style={[styles.day, index > 0 && styles.dayRule]}>
            <View style={styles.dayHeader}>
              <Text style={type.label}>{date === todayKey ? 'Today' : formatDayKey(date, todayKey)}</Text>
              <Text style={[type.mono, styles.dayTotal]}>
                {sets.length} {sets.length === 1 ? 'set' : 'sets'} · {formatAmount(dayTotal(sets))}
                {unitText}
              </Text>
            </View>
            {sets.map((set) => (
              <HistoryRow
                key={set.id}
                set={set}
                unit={unitText}
                dayLabel={date === todayKey ? 'today' : formatDayKey(date, todayKey)}
                isRecord={record?.id === set.id}
                rawUnit={unit}
              />
            ))}
          </View>
        ))}
        {history.length > days ? (
          <Pressable
            onPress={() => setDays((d) => d + DAYS_PAGE)}
            accessibilityRole="button"
            style={(s) => [styles.more, hoverFill(s)]}
          >
            <Text style={[type.bodyStrong, { color: accent.accent }]}>Show earlier days</Text>
          </Pressable>
        ) : null}
      </Card>
    </View>
  );
}

// "08:10 · 20 reps", tagged when it's the set the record comes from. Opens the editor.
function HistoryRow({
  set,
  unit,
  rawUnit,
  dayLabel,
  isRecord,
}: {
  set: LogEntry;
  unit: string;
  rawUnit: string;
  dayLabel: string;
  isRecord: boolean;
}) {
  const type = useType();
  const accent = useAccent();
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const time = set.loggedAt > 0 ? formatTime(set.loggedAt) : null;
  const open = () =>
    ref.current?.measureInWindow((x, y, w, h) => setAnchor({ top: y + h + 4, above: y, left: Math.max(8, x + w - EDITOR_WIDTH) }));

  return (
    <View ref={ref} collapsable={false}>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`Set ${dayLabel}${time ? ` at ${time}` : ''}: ${formatAmount(set.value)}${unit}${isRecord ? ', the record' : ''}. Edit or delete`}
        style={(s) => [styles.row, hoverFill(s)]}
      >
        <Text style={[type.mono, styles.time]}>{time ?? '—'}</Text>
        <Text style={[type.body, styles.dot]}>·</Text>
        <Text style={[type.bodyStrong, styles.value]}>
          {formatAmount(set.value)}
          <Text style={[type.body, styles.unit]}>{unit}</Text>
        </Text>
        {isRecord ? (
          <View style={[styles.badge, { backgroundColor: rgba(accent.accent, 0.12) }]}>
            <Ionicons name="trophy-outline" size={11} color={accent.accent} />
            <Text style={[type.label, styles.badgeText, { color: accent.accent }]}>Record</Text>
          </View>
        ) : null}
        {set.note ? (
          <Text style={[type.body, styles.note]} numberOfLines={1}>
            {set.note}
          </Text>
        ) : (
          <View style={styles.flex} />
        )}
        <Ionicons name="create-outline" size={15} color={colors.textMuted} />
      </Pressable>
      <Popover anchor={anchor} width={EDITOR_WIDTH} onClose={() => setAnchor(null)}>
        {anchor ? (
          <SetEditor
            set={set}
            unit={rawUnit}
            title={`Set ${dayLabel === 'today' ? 'today' : `on ${dayLabel}`}${time ? ` at ${time}` : ''}`}
            onDone={() => setAnchor(null)}
          />
        ) : null}
      </Popover>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  flex: { flex: 1 },
  muted: { color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    maxWidth: 220,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { fontSize: 13 },
  notice: { gap: spacing.sm, borderColor: colors.accentStrong },
  list: { paddingVertical: spacing.sm },
  day: { paddingVertical: spacing.sm, gap: 2 },
  dayRule: { borderTopWidth: 1, borderTopColor: colors.border },
  dayHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 2 },
  dayTotal: { fontSize: 11, color: colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
    borderRadius: radius.control,
  },
  time: { width: 44, fontSize: 13, color: colors.textMuted },
  dot: { color: colors.textMuted },
  value: { fontSize: 15 },
  unit: { fontSize: 13, color: colors.textMuted },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 9 },
  note: { flex: 1, fontSize: 13, color: colors.textMuted },
  more: { alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.control, marginTop: spacing.xs },
});
