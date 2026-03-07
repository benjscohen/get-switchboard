"use client";

import { useState } from "react";
import { ScheduleCard } from "./schedule-card";
import { RunHistory } from "./run-history";
import type { Schedule } from "./types";

interface ScheduleListProps {
  schedules: Schedule[];
  teamNames: Record<string, string>;
}

export function ScheduleList({ schedules, teamNames }: ScheduleListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (schedules.length === 0) return null;

  return (
    <div className="space-y-3">
      {schedules.map((schedule) => {
        const isExpanded = expandedId === schedule.id;
        return (
          <div key={schedule.id}>
            <ScheduleCard
              schedule={schedule}
              teamNames={teamNames}
              expanded={isExpanded}
              onToggle={() => setExpandedId(isExpanded ? null : schedule.id)}
            />
            {isExpanded && <RunHistory scheduleId={schedule.id} />}
          </div>
        );
      })}
    </div>
  );
}
