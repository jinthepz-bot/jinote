import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors } from '../design/theme';
import { RIGHT_SHEET_WIDTH } from './layout';

// A panel that slides in from the right edge of the desktop shell, over the coach
// panel, while the screen to its left stays live (unlike a Modal, nothing blocks or
// traps focus). A screen deep inside the tab navigator can't draw over its sibling
// columns itself, so it hands its content up here: <RightSheet> is a portal, and
// <RightSheetHost> is where it lands.

const SetSheetContext = createContext<((node: ReactNode) => void) | null>(null);

export function RightSheetHost({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode>(null);
  return (
    // Only the setter goes in context. It never changes, so handing content up here
    // re-renders the host and the outlet, never the screens inside `children`.
    <SetSheetContext.Provider value={setNode}>
      <View style={styles.host}>
        {children}
        {node ? <Outlet>{node}</Outlet> : null}
      </View>
    </SetSheetContext.Provider>
  );
}

function Outlet({ children }: { children: ReactNode }) {
  const offset = useRef(new Animated.Value(RIGHT_SHEET_WIDTH)).current;
  useEffect(() => {
    Animated.timing(offset, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  }, [offset]);
  return <Animated.View style={[styles.outlet, { transform: [{ translateX: offset }] }]}>{children}</Animated.View>;
}

// Renders its children in the host's right-hand outlet instead of in place. Every
// render passes the latest content up, so the sheet's own state is kept (same
// component, same position) while its props follow the screen that owns it.
export function RightSheet({ children }: { children: ReactNode }) {
  const setSheet = useContext(SetSheetContext);
  useLayoutEffect(() => {
    setSheet?.(children);
  });
  useLayoutEffect(() => () => setSheet?.(null), [setSheet]);
  return null;
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  outlet: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: RIGHT_SHEET_WIDTH,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: -4, height: 0 },
    elevation: 8,
  },
});
