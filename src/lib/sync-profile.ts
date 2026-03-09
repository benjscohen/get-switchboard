import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sync the authenticated user's OAuth profile data (name, avatar) to the
 * profiles table.  Called from the auth callback after a successful session
 * exchange so that:
 *
 *  1. Invited users (added by an admin before they ever signed in) get their
 *     Google name & avatar written to the profile and status flipped to "active".
 *  2. Returning users get their name/avatar updated if they changed them in
 *     Google — the profiles row always reflects the latest OAuth metadata.
 */
export async function syncProfileFromAuth(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const meta = user.user_metadata ?? {};
  const oauthName: string | null =
    meta.full_name ?? meta.name ?? null;
  const oauthAvatar: string | null = meta.avatar_url ?? null;

  // Read current profile to decide what to update
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, image, status")
    .eq("id", user.id)
    .single();

  if (!profile) return;

  const updates: Record<string, string> = {};

  // Sync name: always take the OAuth value if it exists and differs
  if (oauthName && oauthName !== profile.name) {
    updates.name = oauthName;
  }

  // Sync avatar: always take the OAuth value if it exists and differs
  if (oauthAvatar && oauthAvatar !== profile.image) {
    updates.image = oauthAvatar;
  }

  // Activate invited users on first real sign-in
  if (profile.status === "invited") {
    updates.status = "active";
  }

  if (Object.keys(updates).length === 0) return;

  await supabase.from("profiles").update(updates).eq("id", user.id);
}
