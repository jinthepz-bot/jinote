import type { ActionRecord, ApiMessage, AppMessage } from '../types';

export interface TurnOutput {
  text: string;
  actions: ActionRecord[];
  transcript?: ApiMessage[];
}

// Thrown when a turn fails or is stopped, carrying any tool calls that already
// ran so the app can still show them and keep them in the conversation.
export class TurnError extends Error {
  readonly actions: ActionRecord[];
  readonly transcript: ApiMessage[];
  // The service was busy or unreachable even after retrying: asking again later may
  // work, so the chat offers "Try again". False for errors a retry can't fix.
  readonly canRetry: boolean;

  constructor(message: string, actions: ActionRecord[], transcript: ApiMessage[], canRetry = false) {
    super(message);
    this.name = 'TurnError';
    this.actions = actions;
    this.transcript = transcript;
    this.canRetry = canRetry;
  }
}

// What a backend reports while a turn is under way.
export interface TurnHooks {
  onRetrying?: (retrying: boolean) => void; // the service was busy and it's asking again
}

export interface AgentBackend {
  // `context` is the snapshot of the user's data for this turn (see context.ts).
  respond(history: AppMessage[], context: string, signal: AbortSignal, hooks?: TurnHooks): Promise<TurnOutput>;
}
