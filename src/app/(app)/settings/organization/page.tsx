import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthProfile } from "@/lib/auth-cache";
import { OrgNameForm } from "@/components/settings/org-name-form";
import { DomainManager } from "@/components/settings/domain-manager";

export default async function SettingsOrganizationPage() {
  const auth = await getAuthProfile();
  if (!auth) redirect("/login");

  const orgId = auth.profile?.organization_id;
  if (!orgId) redirect("/mcp");

  const [{ data: org }, { data: domains }] = await Promise.all([
    supabaseAdmin
      .from("organizations")
      .select("id, name, slug, is_personal")
      .eq("id", orgId)
      .single(),
    supabaseAdmin
      .from("organization_domains")
      .select("id, domain, is_primary")
      .eq("organization_id", orgId)
      .order("is_primary", { ascending: false }),
  ]);

  if (!org) redirect("/mcp");

  return (
    <div className="space-y-6">
      <OrgNameForm orgName={org.name} orgSlug={org.slug} />
      <DomainManager
        domains={(domains ?? []).map((d) => ({
          id: d.id,
          domain: d.domain,
          isPrimary: d.is_primary,
        }))}
      />
    </div>
  );
}
