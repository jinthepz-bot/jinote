import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

import { hoverDim } from '../../design/hover';
import { colors } from '../../design/theme';

const ANIMATION_MS = 150;

// The round tick-box on a task in the calendar. Ticking calls straight into the
// shared task store (toggleTask), which updates in memory at once and saves in the
// background — so the tick lands immediately, here and in Today's lists alike. The
// fill pops in over ~150ms; on first render it just shows the current state.
export function RoundCheck({
  done,
  color,
  size = 15,
  label,
  onToggle,
}: {
  done: boolean;
  color: string;
  size?: number;
  label: string;
  onToggle: () => void;
}) {
  const progress = useRef(new Animated.Value(done ? 1 : 0)).current;
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    Animated.timing(progress, { toValue: done ? 1 : 0, duration: ANIMATION_MS, useNativeDriver: false }).start();
  }, [done, progress]);

  return (
    <Pressable
      onPress={onToggle}
      hitSlop={6}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      aria-checked={done}
      accessibilityLabel={label}
      style={(state) => [styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: color }, hoverDim(state)]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: progress,
            transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
          },
        ]}
      >
        <Ionicons name="checkmark" size={size - 4} color={colors.surface} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
