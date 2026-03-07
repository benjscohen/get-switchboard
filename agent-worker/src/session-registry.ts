// ---------------------------------------------------------------------------
// In-memory registry of running Claude Code sessions
// Keyed by "channelId:threadTs" so follow-up messages can find their session
// ---------------------------------------------------------------------------

export interface PendingFollowUp {
  text: string;
  messageTs: string;
  resolve: () => void;
}

export interface RunningSession {
  sessionId: string;
  claudeSessionId: string | null;
  pushMessage: (msg: PendingFollowUp) => boolean;
  close: () => void;
}

const registry = new Map<string, RunningSession>();

export function buildThreadKey(
  channelId: string,
  threadTs: string,
): string {
  return `${channelId}:${threadTs}`;
}

export function getRunningSession(
  threadKey: string,
): RunningSession | undefined {
  return registry.get(threadKey);
}

export function registerSession(
  threadKey: string,
  session: RunningSession,
): void {
  registry.set(threadKey, session);
}

export function unregisterSession(threadKey: string): void {
  registry.delete(threadKey);
}
