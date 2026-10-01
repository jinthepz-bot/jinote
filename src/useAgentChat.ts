import { useCallback, useEffect, useRef, useState } from 'react';

import { backend } from './agent';
import { buildCoachContext } from './agent/context';
import { describeScreen, type CoachScreen } from './agent/screen';
import { runUndo } from './agent/undo';
import { TurnError } from './agent/types';
import { dayKey } from './coach/days';
import { getCoachState } from './coach/store';
import { getNotesState } from './notes/store';
import { getScheduleState } from './schedule/store';
import { loadMessages, saveMessages } from './storage';
import { makeId, type Activity, type AppMessage, type TextMessage } from './types';

function textMessage(role: TextMessage['role'], text: string, extra: Partial<TextMessage> = {}): TextMessage {
  return { id: makeId(), kind: 'text', role, text, createdAt: Date.now(), ...extra };
}

export function useAgentChat() {
  const [messages, setMessages] = useState<AppMessage[]>([]);
  const [activity, setActivity] = useState<Activity>({ kind: 'idle' });
  const [loaded, setLoaded] = useState(false);
  const messagesRef = useRef(messages);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadMessages().then((stored) => {
      setMessages(stored);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
    if (loaded) saveMessages(messages);
  }, [messages, loaded]);

  // `screen` (desktop only) is what the user is looking at; see agent/screen.ts.
  const send = useCallback(async (raw: string, screen?: CoachScreen) => {
    const text = raw.trim();
    if (!text || abortRef.current) return;

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const userMessage = textMessage('user', text);
    const history = [...messagesRef.current, userMessage];
    setMessages(history);
    setActivity({ kind: 'thinking' });

    try {
      // Fresh snapshot of the user's data for this turn, plus what's on screen.
      const today = dayKey();
      const events = getScheduleState().events;
      const state = buildCoachContext(getCoachState(), getNotesState().notes, events, today);
      const context = screen ? `${state}\n\n${describeScreen(screen, events, today)}` : state;
      const reply = await backend.respond(history, context, signal);
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
            actions: partial.actions,
            transcript: partial.transcript,
          }),
        ]);
      } else if (!stopped) {
        setMessages((prev) => [...prev, textMessage('assistant', message, { isError: true })]);
      }
    } finally {
      abortRef.current = null;
      setActivity({ kind: 'idle' });
    }
  }, []);

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

  return { messages, activity, loaded, send, stop, clear, undo };
}
