import { useCallback, useRef, useState } from 'react';

import { backend } from './agent';
import { buildCoachContext } from './agent/context';
import { describeScreen, type CoachScreen } from './agent/screen';
import { runUndo } from './agent/undo';
import { TurnError } from './agent/types';
import { dayKey } from './coach/days';
import { getCoachState } from './coach/store';
import { getDailyState } from './journal/store';
import { getNotesState } from './notes/store';
import { getScheduleState } from './schedule/store';
import { chatStore } from './storage';
import { makeId, type Activity, type AppMessage, type TextMessage } from './types';

function textMessage(role: TextMessage['role'], text: string, extra: Partial<TextMessage> = {}): TextMessage {
  return { id: makeId(), kind: 'text', role, text, createdAt: Date.now(), ...extra };
}

// Writes go straight to the store (and so to storage, and to the other device when
// signed in); `messagesRef` reads it at call time, so a reply lands after whatever
// arrived meanwhile.
function setMessages(next: AppMessage[] | ((prev: AppMessage[]) => AppMessage[])) {
  chatStore.update((prev) => (typeof next === 'function' ? next(prev) : next));
}

const messagesRef = {
  get current() {
    return chatStore.get();
  },
};

export function useAgentChat() {
  const { state: messages, loaded } = chatStore.useStore();
  const [activity, setActivity] = useState<Activity>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  // One turn of the coach on `history` (which ends with what it should answer). Its
  // reply, or what went wrong, is added after it.
  const runTurn = useCallback(async (history: AppMessage[], screen?: CoachScreen) => {
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setMessages(history);
    setActivity({ kind: 'thinking' });

    try {
      // Fresh snapshot of the user's data for this turn, plus what's on screen.
      const today = dayKey();
      const events = getScheduleState().events;
      const coach = getCoachState();
      const state = buildCoachContext(coach, getNotesState().notes, events, today);
      const onScreen = screen ? describeScreen(screen, { events, coach, daily: getDailyState() }, today) : '';
      const context = onScreen ? `${state}\n\n${onScreen}` : state;
      const reply = await backend.respond(history, context, signal, {
        onRetrying: (retrying) => {
          if (!signal.aborted) setActivity({ kind: 'thinking', retrying });
        },
      });
      setMessages((prev) => [
        ...prev,
        textMessage('assistant', reply.text, { actions: reply.actions, transcript: reply.transcript }),
      ]);
    } catch (err) {
      const stopped = signal.aborted;
      const message = err instanceof Error ? err.message : String(err);
      const partial = err instanceof TurnError ? err : null;

      if (partial && partial.transcript.length > 0) {
        // Some tools already ran: keep them visible and in the conversation.
        setMessages((prev) => [
          ...prev,
          textMessage('assistant', stopped ? 'Stopped.' : message, {
            isError: !stopped,
            canRetry: !stopped && partial.canRetry,
            actions: partial.actions,
            transcript: partial.transcript,
          }),
        ]);
      } else if (!stopped) {
        setMessages((prev) => [
          ...prev,
          textMessage('assistant', message, { isError: true, canRetry: partial?.canRetry ?? false }),
        ]);
      }
    } finally {
      abortRef.current = null;
      setActivity({ kind: 'idle' });
    }
  }, []);

  // `screen` (desktop only) is what the user is looking at; see agent/screen.ts.
  const send = useCallback(
    async (raw: string, screen?: CoachScreen) => {
      const text = raw.trim();
      if (!text || abortRef.current) return;
      await runTurn([...messagesRef.current, textMessage('user', text)], screen);
    },
    [runTurn],
  );

  // "Try again" on a "Coach couldn't reply" message: the same question, asked again
  // — not sent a second time. The failed message goes, unless changes were made
  // before it failed; then it stays (with its receipts) and is part of what the coach
  // sees, so it carries on from there rather than making them again.
  const retry = useCallback(
    async (messageId: string, screen?: CoachScreen) => {
      const current = messagesRef.current;
      const last = current[current.length - 1];
      if (abortRef.current || !last || last.id !== messageId || last.kind !== 'text' || !last.canRetry) return;
      const history = last.actions?.length
        ? [...current.slice(0, -1), { ...last, canRetry: false }]
        : current.slice(0, -1);
      await runTurn(history, screen);
    },
    [runTurn],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Takes back one change from a receipt and remembers that it was undone, so the
  // receipt says so after a reload too.
  const undo = useCallback((messageId: string, actionIndex: number) => {
    const message = messagesRef.current.find((m) => m.id === messageId);
    const action = message?.actions?.[actionIndex];
    if (!action?.undo || action.undone) return;
    runUndo(action.undo);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.actions
          ? { ...m, actions: m.actions.map((a, i) => (i === actionIndex ? { ...a, undone: true } : a)) }
          : m,
      ),
    );
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
  }, []);

  return { messages, activity, loaded, send, retry, stop, clear, undo };
}
