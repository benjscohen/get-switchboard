import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_role")
    .eq("id", user.id)
    .single();

  const isOrgAdmin =
    profile?.org_role === "owner" || profile?.org_role === "admin";

  if (isOrgAdmin) {
    redirect("/settings/general");
  } else {
    redirect("/settings/overview");
  }
}
