export type SessionStatus = 'pending' | 'running' | 'idle' | 'completed' | 'failed' | 'timeout';
export type KanbanColumn = 'active' | 'waiting' | 'done';

export interface ThreadSession {
  id: string;
  status: SessionStatus;
  prompt: string;
  result: string | null;
  error: string | null;
  model: string | null;
  totalTurns: number | null;
  title: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ThreadMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface KanbanData {
  active: ThreadSession[];
  waiting: ThreadSession[];
  done: ThreadSession[];
}
