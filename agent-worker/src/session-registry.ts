// ---------------------------------------------------------------------------
// In-memory registry of running Claude Code sessions
// Keyed by "channelId:threadTs" so follow-up messages can find their session
// ---------------------------------------------------------------------------

import type { PermissionMode } from "@anthropic-ai/claude-code";

export interface PendingFollowUp {
  text: string;
  messageTs: string;
  resolve: () => void;
}

export type PlanPhase = "exploring" | "presented" | "revising" | "approved" | "off";

export type PlanDecision =
  | { action: "approve" }
  | { action: "revise"; feedback: string };

export interface PendingPlanApproval {
  plan: string;
  planMessageTs: string;
  resolve: (decision: PlanDecision) => void;
}

export interface RunningSession {
  sessionId: string;
  claudeSessionId: string | null;
  tempDir: string | null;
  pendingFollowUpTs: string[];
  pushMessage: (msg: PendingFollowUp) => boolean;
  close: () => void;
  openGate: () => void;
  isPlanMode: boolean;
  planPhase: PlanPhase;
  pendingPlanApproval: PendingPlanApproval | null;
  setPermissionMode: ((mode: PermissionMode) => Promise<void>) | null;
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

export function findRunningSessionBySessionId(
  sessionId: string,
): RunningSession | undefined {
  for (const session of registry.values()) {
    if (session.sessionId === sessionId) return session;
  }
  return undefined;
}
