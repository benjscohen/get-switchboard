import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateApiKey } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/api-auth";

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  const supabase = await createClient();
  const { data: keys, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, last_used_at, created_at, user_id")
    .eq("organization_id", authResult.organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 });
  }

  // Fetch creator profiles separately to avoid FK join through RLS
  const userIds = [...new Set((keys ?? []).map((k) => k.user_id))];
  const profileMap = new Map<string, { name: string | null; email: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, { name: p.name, email: p.email });
    }
  }

  const mapped = (keys ?? []).map((k) => {
    const creator = profileMap.get(k.user_id) ?? null;
    return {
      id: k.id,
      name: k.name,
      keyPrefix: k.key_prefix,
      lastUsedAt: k.last_used_at,
      createdAt: k.created_at,
      createdBy: creator?.name ?? creator?.email ?? null,
      isOwn: k.user_id === authResult.userId,
    };
  });

  return NextResponse.json(mapped);
}

export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  const rl = checkRateLimit(`keys:${authResult.userId}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const body = await request.json();
  const name = body.name?.trim() || "Default";

  const { raw, hash, prefix } = generateApiKey();

  const supabase = await createClient();
  const { error } = await supabase.from("api_keys").insert({
    user_id: authResult.userId,
    organization_id: authResult.organizationId,
    name,
    key_hash: hash,
    key_prefix: prefix,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
  }

  return NextResponse.json({ key: raw, prefix, name });
}

export async function DELETE(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing key id" }, { status: 400 });
  }

  const supabase = await createClient();

  // Org admins/owners can delete any org key; members can only delete their own
  if (authResult.orgRole === "owner" || authResult.orgRole === "admin") {
    await supabase
      .from("api_keys")
      .delete()
      .eq("id", id)
      .eq("organization_id", authResult.organizationId);
  } else {
    await supabase
      .from("api_keys")
      .delete()
      .eq("id", id)
      .eq("user_id", authResult.userId);
  }

  return NextResponse.json({ success: true });
}
