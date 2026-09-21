import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans';
import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { useFonts } from 'expo-font';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, type TextStyle } from 'react-native';

import { colors, fontFamilies } from './theme';

// How long to wait for fonts before rendering with system fonts instead.
const FONT_TIMEOUT_MS = 4000;

function makeType(custom: boolean) {
  // With custom fonts, the weight is baked into the family name; adding fontWeight
  // on top can make Android pick the wrong face. System fonts need the weight.
  const face = (family: string, fallback: TextStyle): TextStyle => (custom ? { fontFamily: family } : fallback);

  return StyleSheet.create({
    display: { ...face(fontFamilies.display, { fontWeight: '600' }), color: colors.text },
    number: {
      ...face(fontFamilies.displayBold, { fontWeight: '700' }),
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    body: { ...face(fontFamilies.body, {}), color: colors.text, fontSize: 15, lineHeight: 21 },
    bodyStrong: {
      ...face(fontFamilies.bodySemiBold, { fontWeight: '600' }),
      color: colors.text,
      fontSize: 15,
      lineHeight: 21,
    },
    label: {
      ...face(fontFamilies.bodyMedium, { fontWeight: '500' }),
      color: colors.textMuted,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    mono: {
      ...face(fontFamilies.body, {}),
      color: colors.textMuted,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
  });
}

export type TypeStyles = ReturnType<typeof makeType>;

const TypeContext = createContext<TypeStyles>(makeType(false));

// Text styles for the current font state: custom faces once loaded, system fonts otherwise.
export function useType(): TypeStyles {
  return useContext(TypeContext);
}

export function FontProvider({ children }: { children: ReactNode }) {
  const [loaded, error] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
  });
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (error) console.warn('Custom fonts failed to load; using system fonts.', error);
  }, [error]);

  const type = useMemo(() => makeType(loaded), [loaded]);

  // Hold a blank screen briefly so text doesn't flash in the wrong font.
  if (!loaded && !error && !timedOut) return <View style={styles.placeholder} />;

  return <TypeContext.Provider value={type}>{children}</TypeContext.Provider>;
}

const styles = StyleSheet.create({
  placeholder: { flex: 1, backgroundColor: colors.background },
});
