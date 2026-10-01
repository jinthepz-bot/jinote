import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, radius, spacing } from '../design/theme';
import type { TextMessage } from '../types';
import { ActionChips } from './ActionChips';
import { ActionReceipts } from './ActionReceipts';

// `receipts` (the desktop coach panel) shows changes as receipt cards under the reply,
// with Undo; the phone keeps its chips above it.
export function MessageBubble({
  message,
  receipts,
  onUndo,
}: {
  message: TextMessage;
  receipts?: boolean;
  onUndo?: (index: number) => void;
}) {
  const type = useType();
  const accent = useAccent();
  const isUser = message.role === 'user';
  return (
    <View>
      {!receipts && message.actions?.length ? <ActionChips actions={message.actions} style={styles.chips} /> : null}
      {message.text ? (
        <View
          style={[
            styles.bubble,
            isUser ? [styles.user, { backgroundColor: accent.accent, borderColor: accent.accent }] : styles.assistant,
            message.isError && styles.error,
          ]}
        >
          <Text
            selectable
            style={[type.body, isUser && { color: accent.onAccent }, message.isError && styles.errorText]}
          >
            {message.text}
          </Text>
        </View>
      ) : null}
      {receipts && message.actions?.length ? <ActionReceipts actions={message.actions} onUndo={onUndo} /> : null}
    </View>
  );
}

export function ThinkingBubble() {
  const type = useType();
  const accent = useAccent();
  return (
    <View style={[styles.bubble, styles.assistant, styles.thinking]}>
      <ActivityIndicator size="small" color={accent.accent} />
      <Text style={type.label}>Thinking...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { marginTop: 4 },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    marginVertical: 4,
  },
  user: { alignSelf: 'flex-end', borderBottomRightRadius: 3 },
  assistant: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderBottomLeftRadius: 3,
  },
  error: { backgroundColor: colors.accentStrongSoft, borderColor: colors.accentStrong },
  errorText: { color: colors.text },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
