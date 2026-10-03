import { createPersistedStore } from './storage/persistedStore';
import type { AppMessage } from './types';

// The coach chat, kept in a store like everything else so cloud sync can see it (only
// its newest messages travel; see sync/collections.ts).
const KEY = 'jinesis.messages.v1';

function normalize(raw: unknown): AppMessage[] {
  if (!Array.isArray(raw)) return [];
  const messages = raw.filter(
    (m): m is AppMessage =>
      typeof m === 'object' && m !== null && typeof m.id === 'string' && (m.kind === 'text' || m.kind === 'task'),
  );
  return markInterrupted(messages);
}

// A task that was mid-run when the app closed can't resume, so show it as stopped.
function markInterrupted(messages: AppMessage[]): AppMessage[] {
  return messages.map((m) => {
    if (m.kind !== 'task' || (m.status !== 'running' && m.status !== 'reporting')) return m;
    return {
      ...m,
      status: 'stopped',
      steps: m.steps.map((s) => (s.status === 'running' ? { ...s, status: 'stopped' } : s)),
    };
  });
}

export const chatStore = createPersistedStore<AppMessage[]>({
  key: KEY,
  initial: [],
  normalize,
  label: 'chat history',
});
