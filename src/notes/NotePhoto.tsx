import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';

import { colors } from '../design/theme';
import { displayUri, subscribePhotos } from './photos';

// The image behind a note's photoUri. While it isn't on this device yet (sync is
// still downloading it, say) a quiet placeholder keeps the space.
export function NotePhoto({ uri, style }: { uri: string | null; style: StyleProp<ImageStyle> }) {
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      displayUri(uri).then((next) => {
        if (alive) setShown(next);
      });
    void load();
    const unsubscribe = subscribePhotos(() => void load());
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [uri]);

  if (!uri) return null;
  if (!shown) {
    return (
      <View style={[style as object, styles.placeholder]} accessibilityLabel="Photo not loaded yet">
        <Ionicons name="image-outline" size={22} color={colors.textMuted} />
      </View>
    );
  }
  return <Image source={{ uri: shown }} style={style} resizeMode="cover" accessibilityIgnoresInvertColors />;
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
