"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { scopeBadgeLabel } from "@/lib/shared/scope-utils";
import { type Schedule, statusColor } from "./types";

interface ScheduleCardProps {
  schedule: Schedule;
  teamNames: Record<string, string>;
  expanded: boolean;
  onToggle: () => void;
}

function deliveryLabel(d: { type: string; channel_id?: string; path?: string }): string {
  if (d.type === "slack_dm") return "Slack DM";
  if (d.type === "slack_channel") return `#${d.channel_id ?? "channel"}`;
  if (d.type === "file") return d.path ?? "File";
  return d.type;
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const absDiff = Math.abs(diffMs);
  const isFuture = diffMs > 0;

  if (absDiff < 60_000) return isFuture ? "in <1m" : "<1m ago";
  if (absDiff < 3_600_000) {
    const mins = Math.round(absDiff / 60_000);
    return isFuture ? `in ${mins}m` : `${mins}m ago`;
  }
  if (absDiff < 86_400_000) {
    const hrs = Math.round(absDiff / 3_600_000);
    return isFuture ? `in ${hrs}h` : `${hrs}h ago`;
  }
  const days = Math.round(absDiff / 86_400_000);
  return isFuture ? `in ${days}d` : `${days}d ago`;
}

export function ScheduleCard({ schedule, teamNames, expanded, onToggle }: ScheduleCardProps) {
  const isPaused = schedule.paused;
  const isDisabled = !schedule.enabled;

  return (
    <Card
      hover={false}
      className={`p-4 cursor-pointer transition-colors hover:bg-bg-hover/50 ${isPaused || isDisabled ? "opacity-60" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium">{schedule.name}</h3>
            <Badge variant="accent">{scopeBadgeLabel(schedule.scope, schedule.teamId ?? undefined, teamNames)}</Badge>
            {isPaused && <Badge variant="default">Paused</Badge>}
            {isDisabled && <Badge variant="default">Disabled</Badge>}
            {schedule.lastRunStatus && (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(schedule.lastRunStatus)}`}>
                {schedule.lastRunStatus}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {schedule.cronDescription} ({schedule.timezone})
          </p>
          {schedule.description && (
            <p className="mt-0.5 text-xs text-text-tertiary">{schedule.description}</p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs text-text-tertiary">
            {schedule.nextRunAt && (
              <span>Next: {relativeTime(schedule.nextRunAt)}</span>
            )}
            {schedule.lastRunAt && (
              <span>Last: {relativeTime(schedule.lastRunAt)}</span>
            )}
            <span>{schedule.runCount} run{schedule.runCount !== 1 ? "s" : ""}</span>
            {schedule.delivery.length > 0 && (
              <span>{schedule.delivery.map(deliveryLabel).join(", ")}</span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-text-tertiary">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}>
            <path d="M4 6l4 4 4-4" />
          </svg>
        </div>
      </div>
    </Card>
  );
}
