import { useEffect, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, radius, spacing, keyboardAppearance } from '../design/theme';

// Enter sends and Shift+Enter starts a new line, but only where there's a keyboard to
// hold Shift with. A touch keyboard keeps the plain multiline behaviour — the Send
// button is how you send there.
const enterSends = Platform.OS === 'web' && window.matchMedia('(pointer: fine)').matches;

function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

interface Props {
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function Composer({ busy, onSend, onStop }: Props) {
  const type = useType();
  const accent = useAccent();
  const [text, setText] = useState('');
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const canSend = !busy && text.trim() !== '';

  const submit = () => {
    if (!canSend) return;
    onSend(text);
    setText('');
  };

  // react-native-web routes keydown through onKeyPress and only lets the browser insert
  // the newline if nothing prevented the default, so this one handler covers both halves
  // of the rule. The fields it reads are web-only, hence the cast.
  const handleKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const native = event.nativeEvent as TextInputKeyPressEventData & {
      shiftKey?: boolean;
      isComposing?: boolean;
      keyCode?: number;
    };
    if (native.key !== 'Enter' || native.shiftKey) return;
    // Enter also confirms an in-progress IME candidate (Japanese, Chinese, Korean);
    // sending there would cut the word off mid-composition.
    if (native.isComposing || native.keyCode === 229) return;
    event.preventDefault();
    submit();
  };

  return (
    <View style={[styles.bar, { paddingBottom: keyboardVisible ? 10 : Math.max(insets.bottom, 10) }]}>
      <TextInput
        style={[type.body, styles.input]}
        value={text}
        onChangeText={setText}
        placeholder={busy ? 'Working on it...' : 'Message your coach'}
        placeholderTextColor={colors.textMuted}
        keyboardAppearance={keyboardAppearance}
        accessibilityLabel="Message"
        onKeyPress={enterSends ? handleKeyPress : undefined}
        multiline
      />
      {busy ? (
        <Pressable style={[styles.button, styles.stop]} onPress={onStop} accessibilityRole="button">
          <Text style={[type.label, styles.stopText]}>Stop</Text>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.button, { backgroundColor: accent.accent }, !canSend && styles.disabled]}
          onPress={submit}
          disabled={!canSend}
          accessibilityRole="button"
        >
          <Text style={[type.label, styles.sendText, { color: accent.onAccent }]}>Send</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 11,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
  },
  button: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
  sendText: { fontSize: 12 },
  stop: { backgroundColor: colors.accentStrongSoft, borderWidth: 1, borderColor: colors.accentStrong },
  stopText: { color: colors.text, fontSize: 12 },
});
