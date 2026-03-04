import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/api-auth";

async function canManageTeam(auth: { userId: string; orgRole: string; organizationId: string }, teamId: string) {
  if (auth.orgRole === "owner" || auth.orgRole === "admin") return true;
  const { data: membership } = await supabaseAdmin
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", auth.userId)
    .single();
  return membership?.role === "lead";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  // Verify team belongs to user's org
  const { data: team } = await supabaseAdmin
    .from("teams")
    .select("id")
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .single();

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const { data: members } = await supabaseAdmin
    .from("team_members")
    .select("id, user_id, role, joined_at, profiles(name, image)")
    .eq("team_id", id);

  return NextResponse.json(
    (members ?? []).map((m) => {
      const profileRaw = m.profiles as unknown;
      const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as { name: string | null; image: string | null } | null;
      return {
        id: m.id,
        userId: m.user_id,
        role: m.role,
        name: profile?.name ?? null,
        image: profile?.image ?? null,
        joinedAt: m.joined_at,
      };
    })
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  if (!(await canManageTeam(auth, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { userId, role = "member" } = body as { userId?: string; role?: string };

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (role !== "lead" && role !== "member") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Verify user belongs to same org
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .single();

  if (profile?.organization_id !== auth.organizationId) {
    return NextResponse.json({ error: "User not in organization" }, { status: 400 });
  }

  const { data: member, error } = await supabaseAdmin
    .from("team_members")
    .insert({ team_id: id, user_id: userId, role })
    .select("id, user_id, role, joined_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "User already in team" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(member, { status: 201 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  if (!(await canManageTeam(auth, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { userId, role } = body as { userId?: string; role?: string };

  if (!userId || !role) {
    return NextResponse.json({ error: "userId and role are required" }, { status: 400 });
  }

  if (role !== "lead" && role !== "member") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("team_members")
    .update({ role })
    .eq("team_id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  if (!(await canManageTeam(auth, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("team_members")
    .delete()
    .eq("team_id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
