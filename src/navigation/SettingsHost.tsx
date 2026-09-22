import Ionicons from '@expo/vector-icons/Ionicons';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { hoverFill } from '../design/hover';
import { colors, radius, sizes, spacing } from '../design/theme';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useIsDesktop } from './layout';

const Context = createContext<{ open: () => void; close: () => void } | null>(null);

// Settings used to be a sixth tab. It's a place you visit occasionally, not one of
// the app's main surfaces, so it lives behind a gear in each screen's title row and
// opens over the top — which keeps the tab bar at five and readable on a phone.
export function SettingsHost({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const value = useMemo(
    () => ({ open: () => setVisible(true), close: () => setVisible(false) }),
    [],
  );

  return (
    <Context.Provider value={value}>
      {children}
      <Modal visible={visible} animationType="slide" onRequestClose={value.close} transparent={false}>
        <View style={styles.modal}>
          <SettingsScreen onClose={value.close} />
        </View>
      </Modal>
    </Context.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useSettings must be used inside SettingsHost');
  return ctx;
}

// The gear every screen shows in its title row, so Settings is one tap from anywhere.
// Desktop has Settings in the sidebar instead.
export function SettingsButton() {
  const { open } = useSettings();
  const desktop = useIsDesktop();
  const onPress = useCallback(() => open(), [open]);
  if (desktop) return null;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Settings"
      style={(state) => [styles.button, hoverFill(state)]}
    >
      <Ionicons name="settings-outline" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.background },
  button: {
    width: sizes.controlSm,
    height: sizes.controlSm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
