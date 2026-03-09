import type { SessionStatus } from "./types";

export const STATUS_CONFIG: Record<
  SessionStatus,
  { label: string; detailLabel: string; variant: "default" | "accent" | "success" }
> = {
  pending: { label: "Pending", detailLabel: "Pending", variant: "default" },
  running: { label: "Running", detailLabel: "Running", variant: "accent" },
  idle: { label: "Waiting", detailLabel: "Waiting for input", variant: "default" },
  completed: { label: "Completed", detailLabel: "Completed", variant: "success" },
  failed: { label: "Failed", detailLabel: "Failed", variant: "default" },
  timeout: { label: "Timeout", detailLabel: "Timeout", variant: "default" },
};
