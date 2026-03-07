"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Container } from "@/components/ui/container";
import { ScheduleList } from "@/components/schedules/schedule-list";
import type { Schedule } from "@/components/schedules/types";

interface Team {
  id: string;
  name: string;
}

interface SchedulesData {
  organization: Schedule[];
  team: Schedule[];
  user: Schedule[];
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<SchedulesData>({ organization: [], team: [], user: [] });
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSchedules = useCallback(async () => {
    const res = await fetch("/api/schedules");
    if (res.ok) setSchedules(await res.json());
  }, []);

  const fetchTeams = useCallback(async () => {
    const res = await fetch("/api/teams");
    if (res.ok) setTeams(await res.json());
  }, []);

  useEffect(() => {
    Promise.all([fetchSchedules(), fetchTeams()]).then(() => setLoading(false));
  }, [fetchSchedules, fetchTeams]);

  const teamNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of teams) map[t.id] = t.name;
    return map;
  }, [teams]);

  const allSchedules = useMemo(
    () => [...schedules.organization, ...schedules.team, ...schedules.user],
    [schedules],
  );

  const orgSchedules = schedules.organization;
  const teamSchedules = schedules.team;
  const userSchedules = schedules.user;

  return (
    <Container className="py-10">
      <div className="mb-2">
        <h1 className="text-2xl font-bold">Schedules</h1>
      </div>
      <p className="mb-8 text-sm text-text-secondary">
        Automated agent runs on a cron schedule. Manage schedules via the <code className="rounded bg-bg-hover px-1.5 py-0.5 text-xs">manage_schedules</code> MCP tool.
      </p>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-bg-card p-4 animate-pulse">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-28 rounded bg-bg-hover" />
                    <div className="h-5 w-16 rounded bg-bg-hover" />
                  </div>
                  <div className="h-3 w-48 rounded bg-bg-hover" />
                  <div className="h-3 w-32 rounded bg-bg-hover" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && allSchedules.length === 0 && (
        <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">
            No schedules yet. Create one using the <code className="rounded bg-bg-hover px-1.5 py-0.5 text-xs">manage_schedules</code> MCP tool.
          </p>
          <p className="mt-2 text-xs text-text-tertiary">
            Example: <code className="rounded bg-bg-hover px-1.5 py-0.5">manage_schedules create name=&quot;Daily Standup&quot; cron=&quot;0 9 * * 1-5&quot; prompt=&quot;...&quot; scope=user</code>
          </p>
        </div>
      )}

      {!loading && orgSchedules.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Organization
          </h2>
          <ScheduleList schedules={orgSchedules} teamNames={teamNames} />
        </div>
      )}

      {!loading && teamSchedules.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Team
          </h2>
          <ScheduleList schedules={teamSchedules} teamNames={teamNames} />
        </div>
      )}

      {!loading && userSchedules.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Personal
          </h2>
          <ScheduleList schedules={userSchedules} teamNames={teamNames} />
        </div>
      )}
    </Container>
  );
}
