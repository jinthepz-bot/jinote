import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { hoverFill } from '../design/hover';
import { colors, radius, spacing } from '../design/theme';
import type { TextMessage } from '../types';
import { ActionChips } from './ActionChips';
import { ActionReceipts } from './ActionReceipts';

// `receipts` (the desktop coach panel) shows changes as receipt cards under the reply,
// with Undo; the phone keeps its chips above it. `onRetry` is passed only while this
// is a retryable error that's the latest message and nothing is running.
export function MessageBubble({
  message,
  receipts,
  onUndo,
  onRetry,
}: {
  message: TextMessage;
  receipts?: boolean;
  onUndo?: (index: number) => void;
  onRetry?: () => void;
}) {
  const type = useType();
  const accent = useAccent();
  const isUser = message.role === 'user';
  return (
    <View>
      {!receipts && message.actions?.length ? <ActionChips actions={message.actions} style={styles.chips} /> : null}
      {message.canRetry ? (
        <CouldNotReply detail={message.text} onRetry={onRetry} />
      ) : message.text ? (
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

// The service was busy even after retrying. The reason stays as a smaller line.
function CouldNotReply({ detail, onRetry }: { detail: string; onRetry?: () => void }) {
  const type = useType();
  const accent = useAccent();
  return (
    <View style={[styles.bubble, styles.assistant, styles.failed]} accessibilityRole="alert">
      <View style={styles.failedHead}>
        <Ionicons name="cloud-offline-outline" size={16} color={colors.textMuted} />
        <Text style={type.bodyStrong}>Coach couldn't reply</Text>
      </View>
      <Text style={[type.body, styles.failedDetail]} selectable>
        {detail}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          style={(s) => [styles.retry, { borderColor: accent.accent }, hoverFill(s)]}
        >
          <Ionicons name="refresh" size={14} color={accent.accent} />
          <Text style={[type.bodyStrong, styles.retryText, { color: accent.accent }]}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ThinkingBubble({ retrying }: { retrying?: boolean }) {
  const type = useType();
  const accent = useAccent();
  return (
    <View style={[styles.bubble, styles.assistant, styles.thinking]}>
      <ActivityIndicator size="small" color={accent.accent} />
      {retrying ? (
        <Text style={[type.body, styles.retrying]}>Coach is busy, retrying…</Text>
      ) : (
        <Text style={type.label}>Thinking...</Text>
      )}
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
  retrying: { fontSize: 13, color: colors.textMuted },
  failed: { gap: 6 },
  failedHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  failedDetail: { fontSize: 13, color: colors.textMuted },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.control,
    borderWidth: 1,
  },
  retryText: { fontSize: 14 },
});
