import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAccent } from '../../design/accent';
import { hoverDim, hoverFill } from '../../design/hover';
import { useType } from '../../design/fonts';
import { colors, radius, sizes, spacing } from '../../design/theme';
import { Segmented, type IconName } from '../../design/ui';
import { ZOOM_LEVELS, type CalendarMode } from './viewStore';

const MENU_WIDTH = 150;

// What the view switch can show: the saved modes, plus "3 days" while the window is
// too narrow for a readable week (see useCalendarSpan).
export type ToolbarView = CalendarMode | '3day';

const MODES: { value: ToolbarView; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const NARROW_MODES: { value: ToolbarView; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: '3day', label: '3 days' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

interface Props {
  title: string; // "September 2026"
  mode: ToolbarView;
  onModeChange: (mode: ToolbarView) => void;
  // A narrow window: offers "3 days" and puts the view switch and zoom on a second row.
  narrow?: boolean;
  onToday: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onNewEvent: () => void;
  onNewTask: () => void;
  zoom: number | null; // null in month view, where there are no hours to zoom
  onZoomChange: (zoom: number) => void;
  stepLabel: string; // "week", "day" or "month", for the arrows' labels
}

export function CalendarToolbar({
  title,
  mode,
  onModeChange,
  onToday,
  onPrevious,
  onNext,
  onNewEvent,
  onNewTask,
  zoom,
  onZoomChange,
  stepLabel,
  narrow,
}: Props) {
  const type = useType();
  const accent = useAccent();
  const newButtonRef = useRef<View>(null);
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);

  // Measured rather than laid out next to the button: the menu renders in a modal
  // layer, which has its own coordinate space.
  const openMenu = () => {
    newButtonRef.current?.measureInWindow((x, y, width, height) => {
      setMenu({ top: y + height + 4, left: x + width - MENU_WIDTH });
    });
  };
  const closeMenu = () => setMenu(null);

  const zoomControls =
    zoom !== null ? (
      <View style={styles.zoom}>
        <ZoomButton icon="remove" label="Zoom out" disabled={zoom <= 0} onPress={() => onZoomChange(zoom - 1)} />
        <ZoomButton icon="add" label="Zoom in" disabled={zoom >= ZOOM_LEVELS - 1} onPress={() => onZoomChange(zoom + 1)} />
        <Pressable
          onPress={() => onZoomChange(0)}
          accessibilityRole="button"
          accessibilityLabel="Fit the whole day"
          accessibilityState={{ selected: zoom === 0 }}
          style={(state) => [styles.fitButton, zoom === 0 && styles.fitButtonOn, hoverFill(state)]}
        >
          <Text style={[type.label, styles.fitText, zoom === 0 && { color: accent.accent }]}>Fit day</Text>
        </Pressable>
      </View>
    ) : null;

  const modes = (
    <View style={narrow ? styles.modesNarrow : styles.modes}>
      <Segmented options={narrow ? NARROW_MODES : MODES} value={mode} onChange={onModeChange} describe={(o) => `${o.label} view`} />
    </View>
  );

  return (
    <View style={narrow ? styles.stack : undefined}>
      <View style={styles.root}>
        <Pressable
          onPress={onToday}
          accessibilityRole="button"
          accessibilityLabel="Go to today"
          style={(state) => [styles.todayButton, hoverFill(state)]}
        >
          <Text style={[type.bodyStrong, styles.todayText]}>Today</Text>
        </Pressable>

        <View style={styles.arrows}>
          <Pressable
            onPress={onPrevious}
            accessibilityRole="button"
            accessibilityLabel={`Previous ${stepLabel}`}
            style={(state) => [styles.arrow, hoverFill(state)]}
          >
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={onNext}
            accessibilityRole="button"
            accessibilityLabel={`Next ${stepLabel}`}
            style={(state) => [styles.arrow, hoverFill(state)]}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </Pressable>
        </View>

        <Text style={[type.display, styles.title]} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>

        {/* Takes the slack, so the title only starts truncating once the row is genuinely full. */}
        <View style={styles.spacer} />

        {narrow ? null : zoomControls}
        {narrow ? null : modes}

        <View ref={newButtonRef} collapsable={false}>
          <Pressable
            onPress={openMenu}
            accessibilityRole="button"
            accessibilityLabel="New"
            accessibilityState={{ expanded: menu !== null }}
            style={(state) => [styles.newButton, { backgroundColor: accent.accent }, hoverDim(state)]}
          >
            <Ionicons name="add" size={18} color={accent.onAccent} />
            <Text style={[type.bodyStrong, { color: accent.onAccent }]}>New</Text>
          </Pressable>
        </View>

        {/* The menu and its catch-all backdrop live in one modal layer, so a click
            anywhere else closes it — and nothing below can be clicked through it. */}
        <Modal visible={menu !== null} transparent animationType="none" onRequestClose={closeMenu}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} accessibilityLabel="Close menu" />
          {menu ? (
            <View style={[styles.menu, { top: menu.top, left: menu.left }]}>
              <MenuItem
                icon="calendar-outline"
                label="Event"
                onPress={() => {
                  closeMenu();
                  onNewEvent();
                }}
              />
              <MenuItem
                icon="checkbox-outline"
                label="Task"
                onPress={() => {
                  closeMenu();
                  onNewTask();
                }}
              />
            </View>
          ) : null}
        </Modal>
      </View>
      {narrow ? (
        <View style={styles.root}>
          {modes}
          <View style={styles.spacer} />
          {zoomControls}
        </View>
      ) : null}
    </View>
  );
}

function ZoomButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={(state) => [styles.zoomButton, disabled ? styles.zoomDisabled : hoverFill(state)]}
    >
      <Ionicons name={icon} size={15} color={colors.text} />
    </Pressable>
  );
}

function MenuItem({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const type = useType();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityLabel={`New ${label.toLowerCase()}`}
      style={(state) => [styles.menuItem, hoverFill(state)]}
    >
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <Text style={type.body}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  todayButton: {
    height: sizes.controlSm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayText: { fontSize: 14 },
  arrows: { flexDirection: 'row', gap: spacing.xs },
  arrow: {
    width: sizes.controlSm,
    height: sizes.controlSm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 22 rather than 26: at 1280 with the coach panel open, the row is only just wide
  // enough for "September 2026" beside the controls, and a truncated month is worse
  // than a slightly smaller one.
  title: { flexShrink: 1, fontSize: 22, lineHeight: 28 },
  spacer: { flex: 1, minWidth: spacing.sm },
  modes: { width: 168 },
  modesNarrow: { width: 240 },
  stack: { gap: spacing.sm },
  newButton: {
    height: sizes.controlSm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  zoom: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  zoomButton: {
    width: 28,
    height: sizes.controlSm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDisabled: { opacity: 0.35 },
  fitButton: {
    height: sizes.controlSm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fitButtonOn: { backgroundColor: colors.surface },
  fitText: { fontSize: 10 },
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingVertical: spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.controlSm,
    paddingHorizontal: spacing.md,
  },
  menuItemPressed: { backgroundColor: colors.surface2 },
});
