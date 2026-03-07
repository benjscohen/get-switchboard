export interface Schedule {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cronExpression: string;
  cronDescription: string;
  timezone: string;
  scope: "organization" | "team" | "user";
  teamId?: string | null;
  enabled: boolean;
  paused: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  runCount: number;
  consecutiveFailures: number;
  delivery: Array<{ type: string; channel_id?: string; path?: string }>;
}

export function statusColor(status: string | null): string {
  switch (status) {
    case "completed": return "bg-green-500/20 text-green-400";
    case "failed": case "timeout": return "bg-red-500/20 text-red-400";
    case "running": case "pending": return "bg-yellow-500/20 text-yellow-400";
    case "skipped": return "bg-gray-500/20 text-text-tertiary";
    default: return "bg-gray-500/20 text-text-tertiary";
  }
}
