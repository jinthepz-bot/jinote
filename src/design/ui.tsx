import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccent } from './accent';
import { useType } from './fonts';
import { colors, radius, sizes, spacing } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// Rounded surface with a 1px border: the basic container for every section.
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// Small uppercase mono label above a section, with an optional note on the right.
export function Section({ label, aside, children }: { label: string; aside?: string; children: ReactNode }) {
  const type = useType();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={type.label}>{label}</Text>
        {aside ? <Text style={type.label}>{aside}</Text> : null}
      </View>
      {children}
    </View>
  );
}

// Small mono label + big condensed title, used at the top of every screen.
// `action` is the screen's one top-right control (in practice, Settings).
export function ScreenTitle({ label, title, action }: { label: string; title: string; action?: ReactNode }) {
  const type = useType();
  return (
    <View style={styles.titleBlock}>
      <View style={styles.titleTop}>
        <Text style={[type.label, styles.titleLabel]} numberOfLines={1}>
          {label}
        </Text>
        {action}
      </View>
      <Text style={[type.display, styles.title]} numberOfLines={1} adjustsFontSizeToFit accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

// The scrolling body every screen shares: one horizontal inset, one bottom inset,
// one gap between sections, centred and width-capped on a tablet or the web.
export function Screen({
  children,
  style,
  contentStyle,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={[styles.screen, style]}
      contentContainerStyle={[styles.screenContent, { paddingTop: insets.top + spacing.lg }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {children}
    </ScrollView>
  );
}

// The padding a screen applies to its own scrolling content, for the screens that
// need their own list instead of `Screen` (Journal's FlatList).
export const screenContentStyle = {
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl * 2,
  width: '100%',
  maxWidth: 560,
  alignSelf: 'center',
} as const;

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  small?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', small, disabled, accessibilityLabel, style }: ButtonProps) {
  const type = useType();
  const accent = useAccent();
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        primary ? { backgroundColor: accent.accent } : styles.secondary,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[type.label, styles.buttonText, { color: primary ? accent.onAccent : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

// A bordered square icon button — the standard "one action on a card" control.
export function IconButton({
  icon,
  label,
  onPress,
  color = colors.textMuted,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={17} color={color} />
    </Pressable>
  );
}

// An unboxed icon action sitting inside a list row (delete, edit). Same size and
// hit area everywhere, so rows in different lists line up and feel the same.
export function RowIconButton({
  icon,
  label,
  onPress,
  color = colors.textMuted,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.rowIconButton, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={sizes.rowIcon} color={color} />
    </Pressable>
  );
}

// The full-width dashed "+ New ..." action that ends a list of cards.
export function AddAction({ label, onPress }: { label: string; onPress: () => void }) {
  const type = useType();
  const accent = useAccent();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.addAction, { borderColor: accent.accent }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[type.label, { color: accent.accent }]}>+ {label}</Text>
    </Pressable>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

// One-of-N picker in a tinted trough. Used for note type, goal type, event type
// and the journal filter — all of which had their own near-identical copy.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  describe,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  describe?: (option: SegmentedOption<T>) => string;
}) {
  const type = useType();
  const accent = useAccent();
  return (
    <View style={styles.segment} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[styles.segmentOption, selected && { backgroundColor: accent.accent }]}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            aria-checked={selected}
            accessibilityLabel={describe ? describe(option) : option.label}
          >
            <Text style={[type.label, styles.segmentText, selected && { color: accent.onAccent }]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// A standalone toggleable pill: category filters, reminder lead times, weekdays.
export function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
  accessibilityRole = 'radio',
  style,
  textStyle,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: 'radio' | 'checkbox' | 'button';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const type = useType();
  const accent = useAccent();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: accent.accent, borderColor: accent.accent }, style]}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityRole === 'button' ? undefined : { checked: selected }}
      aria-checked={accessibilityRole === 'button' ? undefined : selected}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text style={[type.label, selected && { color: accent.onAccent }, textStyle]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// A checkbox that matches every other checkbox in the app.
export function Checkbox({
  checked,
  onPress,
  label,
  size = sizes.checkbox,
}: {
  checked: boolean;
  onPress: () => void;
  label: string;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={[styles.checkbox, { width: size, height: size }, checked && styles.checkboxChecked]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      accessibilityLabel={label}
    >
      {checked ? <Ionicons name="checkmark" size={size - 7} color={colors.background} /> : null}
    </Pressable>
  );
}

// An on/off row: a label (and optional hint) with a switch, themed for the dark surfaces.
export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const type = useType();
  const accent = useAccent();
  return (
    <View style={[styles.toggleRow, disabled && styles.disabled]}>
      <View style={styles.toggleText}>
        <Text style={type.body}>{label}</Text>
        {hint ? <Text style={[type.mono, styles.toggleHint]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.surface2, true: accent.accent }}
        thumbColor={colors.text}
        ios_backgroundColor={colors.surface2}
        accessibilityLabel={label}
      />
    </View>
  );
}

// Shared text-field look for inputs on the dark surfaces.
export const fieldStyles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
  single: { height: sizes.control },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  titleBlock: { gap: spacing.xs },
  titleTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  titleLabel: { flex: 1 },
  title: { fontSize: 56, lineHeight: 62, letterSpacing: 1.5 },
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: {
    ...screenContentStyle,
    gap: spacing.xl,
  },
  button: {
    height: sizes.control,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: { height: sizes.controlSm, paddingHorizontal: spacing.md },
  secondary: { borderWidth: 1, borderColor: colors.border },
  buttonText: { fontSize: 12 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  iconButton: {
    width: sizes.controlSm,
    height: sizes.controlSm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconButton: { padding: spacing.xs / 2 },
  addAction: {
    height: sizes.action,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    padding: 3,
  },
  segmentOption: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.control - 2,
  },
  segmentText: { fontSize: 10 },
  chip: {
    minHeight: sizes.controlSm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    borderRadius: radius.square,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.success, borderColor: colors.success },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  toggleText: { flex: 1, gap: spacing.xs / 2 },
  toggleHint: { color: colors.textMuted },
});
