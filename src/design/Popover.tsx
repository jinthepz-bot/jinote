import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useType } from './fonts';
import { hoverFill } from './hover';
import { colors, radius, sizes, spacing } from './theme';
import type { IconName } from './ui';

export interface PopoverAnchor {
  top: number;
  left: number;
}

// A small menu in a modal layer at a point on screen: under a button, or where a
// right-click landed. A click anywhere else closes it. Kept inside the window.
export function Popover({
  anchor,
  width,
  onClose,
  children,
}: {
  anchor: PopoverAnchor | null;
  width: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const window = useWindowDimensions();
  if (!anchor) return null;
  const left = Math.max(spacing.sm, Math.min(anchor.left, window.width - width - spacing.sm));
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={[styles.menu, { top: anchor.top, left, width }]} accessibilityRole="menu">
        {children}
      </View>
    </Modal>
  );
}

// Opens a popover under (and right-aligned or left-aligned with) a View.
export function useAnchoredPopover(align: 'left' | 'right', width: number) {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const open = () =>
    ref.current?.measureInWindow((x, y, w, h) =>
      setAnchor({ top: y + h + 4, left: align === 'left' ? x : x + w - width }),
    );
  return { ref: ref as RefObject<View>, anchor, open, close: () => setAnchor(null) };
}

export function MenuRow({
  icon,
  label,
  checked,
  danger,
  onPress,
}: {
  icon?: IconName;
  label: string;
  checked?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const type = useType();
  const tint = danger ? colors.deadlineRed : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      accessibilityState={checked === undefined ? undefined : { checked }}
      style={(s) => [styles.row, hoverFill(s)]}
    >
      {icon ? <Ionicons name={icon} size={16} color={danger ? tint : colors.textMuted} /> : null}
      <Text style={[type.body, styles.label, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
      {checked ? <Ionicons name="checkmark" size={16} color={colors.text} /> : null}
    </Pressable>
  );
}

export function MenuDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingVertical: spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.controlSm, paddingHorizontal: spacing.md },
  label: { flex: 1, fontSize: 14 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.xs },
});
