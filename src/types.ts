import type { ScheduleEvent } from './schedule/store';

// One backend's raw wire messages for a turn (tool calls and results included),
// stored so later requests can replay the conversation exactly as it happened.
// Each provider (see src/agent/) defines and validates its own shape; this stays
// opaque here so switching providers can never be a type error, only a provider
// choosing not to replay a transcript it doesn't recognize (see e.g. claude.ts's
// isClaudeTranscript).
export type ApiMessage = unknown;

export type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'stopped';

// 'reporting' = all steps finished, the assistant is writing the final report.
export type TaskStatus = 'running' | 'reporting' | 'done' | 'error' | 'stopped';

export type ActionKind =
  | 'progress_logged'
  | 'goal_created'
  | 'deadline_set'
  | 'task_added'
  | 'task_completed'
  | 'buy_added'
  | 'buy_bought'
  | 'journal_saved' // legacy: emitted by save_journal_entry before Stage 6, kept so old chat history still renders
  | 'event_added'
  | 'event_deleted'
  | 'event_moved'
  | 'note_saved'
  | 'recipe_saved';

// How to take back one change the coach made. Plain data, not a function, because
// chat history (and these receipts with it) is saved to storage. See agent/undo.ts.
export type UndoRecord =
  | { kind: 'deleteTask'; id: string }
  | { kind: 'reopenTask'; id: string }
  | { kind: 'deleteEvent'; id: string }
  | { kind: 'restoreEvent'; event: ScheduleEvent }
  | { kind: 'deleteBuyItem'; id: string }
  | { kind: 'unbuy'; id: string }
  | { kind: 'deleteNote'; id: string }
  | { kind: 'removeLog'; entryId: string; previousCurrent: number }
  | { kind: 'deleteGoal'; id: string }
  | { kind: 'setDeadline'; goalId: string; deadline: string | null };

// A change the assistant made to the user's data, shown in the chat.
export interface ActionRecord {
  kind: ActionKind;
  label: string; // one-line summary; all that older saved messages have
  area?: string; // "Schedule", "Task", "Goal"… — shown in bold on the receipt
  detail?: string; // what changed: "Added Gym, Wed 19:00"
  undo?: UndoRecord;
  undone?: boolean;
}

export interface TaskStep {
  title: string;
  status: StepStatus;
  output?: string;
  actions?: ActionRecord[];
  transcript?: ApiMessage[];
}

export interface TextMessage {
  id: string;
  kind: 'text';
  role: 'user' | 'assistant';
  text: string;
  isError?: boolean;
  actions?: ActionRecord[];
  transcript?: ApiMessage[];
  createdAt: number;
}

export interface TaskMessage {
  id: string;
  kind: 'task';
  role: 'assistant';
  title: string;
  steps: TaskStep[];
  status: TaskStatus;
  result?: string;
  error?: string;
  // Changes made while planning or writing the report (step changes live on steps).
  actions?: ActionRecord[];
  // The planning turn, ending with the start_task tool result.
  transcript?: ApiMessage[];
  createdAt: number;
}

export type AppMessage = TextMessage | TaskMessage;

// What the assistant is doing right now, shown in the header.
export type Activity = { kind: 'idle' } | { kind: 'thinking' };

export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
