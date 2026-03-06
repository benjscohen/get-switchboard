export interface UserLookup {
  userId: string;
  organizationId: string;
  agentKey: string;
  model: string;
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
  claudeSessionId: string | null;
  status: "pending" | "running" | "completed" | "failed" | "timeout";
  prompt: string;
  result: string | null;
  error: string | null;
  model: string | null;
  totalTurns: number | null;
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
