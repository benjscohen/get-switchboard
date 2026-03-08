export interface UserLookup {
  userId: string;
  organizationId: string;
  agentKey: string;
  model: string;
  name?: string;
  email?: string;
  slackUserId?: string;
  showThinking?: boolean;
}

export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  urlPrivate: string;
  size: number;
}

export interface SessionRow {
  id: string;
  userId: string;
  organizationId: string;
  slackChannelId: string;
  slackThreadTs: string | null;
  slackMessageTs: string | null;
  claudeSessionId: string | null;
  status: "pending" | "running" | "idle" | "completed" | "failed" | "timeout";
  prompt: string;
  result: string | null;
  error: string | null;
  model: string | null;
  totalTurns: number | null;
  retryOf: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface MessageRow {
  sessionId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  slackTs: string | null;
  metadata: Record<string, unknown>;
}
