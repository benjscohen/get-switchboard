import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getAuthProfile = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "role, name, image, organization_id, org_role, organizations(name, slug, is_personal)"
    )
    .eq("id", user.id)
    .single();

  return { user, profile };
});
