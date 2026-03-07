import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthProfile } from "@/lib/auth-cache";
import { TeamsList } from "@/components/settings/teams-list";

export default async function SettingsTeamsPage() {
  const auth = await getAuthProfile();
  if (!auth) redirect("/login");

  const orgId = auth.profile?.organization_id;
  if (!orgId) redirect("/tools");

  const { data: teamsRaw } = await supabaseAdmin
    .from("teams")
    .select("id, name, slug, created_at, team_members(count)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  const teams = (teamsRaw ?? []).map((t) => {
    const membersRaw = t.team_members as unknown;
    const memberCount = Array.isArray(membersRaw)
      ? (membersRaw[0] as { count: number })?.count ?? 0
      : 0;
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      memberCount,
      createdAt: t.created_at,
    };
  });

  return <TeamsList initialTeams={teams} />;
}
