import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/encryption";
import { discoverTools } from "@/lib/mcp/proxy-client";
import { validatePermissionsPayload } from "@/lib/permissions";
import { getFullCatalog } from "@/lib/integrations/catalog";
import { allProxyIntegrations } from "@/lib/integrations/proxy-registry";
import type { ToolMeta } from "@/lib/mcp/tool-filtering";

// ── Auth helpers ──

type McpAuthExtra = { authInfo?: { extra?: Record<string, unknown> } };
type McpErrorResult = { content: Array<{ type: "text"; text: string }>; isError: true };
type OrgAdminCtx = { userId: string; organizationId: string; orgRole: string };
type SuperAdminCtx = OrgAdminCtx & { role: string };

function requireOrgAdminMcp(extra: McpAuthExtra): OrgAdminCtx | McpErrorResult {
  const userId = extra.authInfo?.extra?.userId as string | undefined;
  const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;
  const orgRole = extra.authInfo?.extra?.orgRole as string | undefined;

  if (!userId || !organizationId) {
    return { content: [{ type: "text", text: "Unauthorized" }], isError: true };
  }
  if (orgRole !== "owner" && orgRole !== "admin") {
    return { content: [{ type: "text", text: "Requires org admin privileges" }], isError: true };
  }
  return { userId, organizationId, orgRole };
}

function requireSuperAdminMcp(extra: McpAuthExtra): SuperAdminCtx | McpErrorResult {
  const orgResult = requireOrgAdminMcp(extra);
  if ("isError" in orgResult) {
    // Still need userId/orgId even if not org admin — super admin overrides
    const userId = extra.authInfo?.extra?.userId as string | undefined;
    const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;
    const orgRole = extra.authInfo?.extra?.orgRole as string | undefined;
    const role = extra.authInfo?.extra?.role as string | undefined;

    if (!userId || !organizationId) {
      return { content: [{ type: "text", text: "Unauthorized" }], isError: true };
    }
    if (role !== "admin") {
      return { content: [{ type: "text", text: "Requires super admin privileges" }], isError: true };
    }
    return { userId, organizationId, orgRole: orgRole ?? "member", role };
  }

  const role = extra.authInfo?.extra?.role as string | undefined;
  if (role !== "admin") {
    return { content: [{ type: "text", text: "Requires super admin privileges" }], isError: true };
  }
  return { ...orgResult, role };
}

function isError(result: unknown): result is McpErrorResult {
  return typeof result === "object" && result !== null && "isError" in result;
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string): McpErrorResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

// ── Tool registration ──

export function registerAdminTools(server: McpServer, toolMeta: Map<string, ToolMeta>) {
  // ═══════════════════════════════════════════════════
  // Tier 1: Org Admin Tools (org_role = owner | admin)
  // ═══════════════════════════════════════════════════

  // ── admin_teams ──
  server.tool(
    "admin_teams",
    "Manage teams in your organization. Actions: list, get, create, update, delete.",
    {
      action: z.enum(["list", "get", "create", "update", "delete"]),
      team_id: z.string().optional().describe("Required for get/update/delete"),
      name: z.string().optional().describe("Required for create/update"),
    },
    async (args, extra) => {
      const auth = requireOrgAdminMcp(extra);
      if (isError(auth)) return auth;

      switch (args.action) {
        case "list": {
          const { data: teams } = await supabaseAdmin
            .from("teams")
            .select("id, name, slug, created_at, updated_at")
            .eq("organization_id", auth.organizationId)
            .order("name");

          const teamIds = (teams ?? []).map((t) => t.id);
          const { data: memberCounts } = teamIds.length
            ? await supabaseAdmin.from("team_members").select("team_id").in("team_id", teamIds)
            : { data: [] };

          const countMap = new Map<string, number>();
          for (const m of memberCounts ?? []) {
            countMap.set(m.team_id, (countMap.get(m.team_id) ?? 0) + 1);
          }

          return ok((teams ?? []).map((t) => ({
            id: t.id, name: t.name, slug: t.slug,
            memberCount: countMap.get(t.id) ?? 0,
            createdAt: t.created_at, updatedAt: t.updated_at,
          })));
        }

        case "get": {
          if (!args.team_id) return err("team_id is required");
          const { data: team } = await supabaseAdmin
            .from("teams")
            .select("id, name, slug, created_at, updated_at")
            .eq("id", args.team_id)
            .eq("organization_id", auth.organizationId)
            .single();

          if (!team) return err("Team not found");

          const { data: members } = await supabaseAdmin
            .from("team_members")
            .select("id, user_id, role, joined_at, profiles(name, image)")
            .eq("team_id", args.team_id);

          return ok({
            ...team,
            members: (members ?? []).map((m) => {
              const profileRaw = m.profiles as unknown;
              const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as { name: string | null; image: string | null } | null;
              return { id: m.id, userId: m.user_id, role: m.role, name: profile?.name ?? null, joinedAt: m.joined_at };
            }),
          });
        }

        case "create": {
          if (!args.name?.trim()) return err("name is required");
          const slug = args.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          if (!slug) return err("Invalid name");

          const { data: team, error: insertErr } = await supabaseAdmin
            .from("teams")
            .insert({ organization_id: auth.organizationId, name: args.name.trim(), slug })
            .select("id, name, slug, created_at")
            .single();

          if (insertErr) {
            return err(insertErr.code === "23505" ? "A team with this name already exists" : insertErr.message);
          }
          return ok({ ...team, memberCount: 0 });
        }

        case "update": {
          if (!args.team_id) return err("team_id is required");
          if (!args.name?.trim()) return err("name is required");

          const { error: updateErr } = await supabaseAdmin
            .from("teams")
            .update({ name: args.name.trim(), updated_at: new Date().toISOString() })
            .eq("id", args.team_id)
            .eq("organization_id", auth.organizationId);

          if (updateErr) return err(updateErr.message);
          return ok({ ok: true });
        }

        case "delete": {
          if (!args.team_id) return err("team_id is required");

          const { error: delErr } = await supabaseAdmin
            .from("teams")
            .delete()
            .eq("id", args.team_id)
            .eq("organization_id", auth.organizationId);

          if (delErr) return err(delErr.message);
          return ok({ ok: true });
        }
      }
    }
  );
  toolMeta.set("admin_teams", { integrationId: "admin:org", orgId: null });

  // ── admin_team_members ──
  server.tool(
    "admin_team_members",
    "Manage team membership. Actions: list, add, update, remove.",
    {
      action: z.enum(["list", "add", "update", "remove"]),
      team_id: z.string().describe("Team ID"),
      user_id: z.string().optional().describe("Required for add/update/remove"),
      role: z.enum(["lead", "member"]).optional().describe("Required for add/update"),
    },
    async (args, extra) => {
      const auth = requireOrgAdminMcp(extra);
      if (isError(auth)) return auth;

      // Verify team belongs to org
      const { data: team } = await supabaseAdmin
        .from("teams").select("id").eq("id", args.team_id).eq("organization_id", auth.organizationId).single();
      if (!team) return err("Team not found");

      switch (args.action) {
        case "list": {
          const { data: members } = await supabaseAdmin
            .from("team_members")
            .select("id, user_id, role, joined_at, profiles(name, image)")
            .eq("team_id", args.team_id);

          return ok((members ?? []).map((m) => {
            const profileRaw = m.profiles as unknown;
            const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as { name: string | null; image: string | null } | null;
            return { id: m.id, userId: m.user_id, role: m.role, name: profile?.name ?? null, joinedAt: m.joined_at };
          }));
        }

        case "add": {
          if (!args.user_id) return err("user_id is required");
          const role = args.role ?? "member";

          // Verify user in same org
          const { data: profile } = await supabaseAdmin
            .from("profiles").select("organization_id").eq("id", args.user_id).single();
          if (profile?.organization_id !== auth.organizationId) return err("User not in organization");

          const { data: member, error: addErr } = await supabaseAdmin
            .from("team_members")
            .insert({ team_id: args.team_id, user_id: args.user_id, role })
            .select("id, user_id, role, joined_at")
            .single();

          if (addErr) return err(addErr.code === "23505" ? "User already in team" : addErr.message);
          return ok(member);
        }

        case "update": {
          if (!args.user_id) return err("user_id is required");
          if (!args.role) return err("role is required");

          const { error: updateErr } = await supabaseAdmin
            .from("team_members")
            .update({ role: args.role })
            .eq("team_id", args.team_id)
            .eq("user_id", args.user_id);

          if (updateErr) return err(updateErr.message);
          return ok({ ok: true });
        }

        case "remove": {
          if (!args.user_id) return err("user_id is required");

          const { error: delErr } = await supabaseAdmin
            .from("team_members")
            .delete()
            .eq("team_id", args.team_id)
            .eq("user_id", args.user_id);

          if (delErr) return err(delErr.message);
          return ok({ ok: true });
        }
      }
    }
  );
  toolMeta.set("admin_team_members", { integrationId: "admin:org", orgId: null });

  // ── admin_org ──
  server.tool(
    "admin_org",
    "View or update your organization info. Actions: get, update.",
    {
      action: z.enum(["get", "update"]),
      name: z.string().optional().describe("New org name (for update)"),
    },
    async (args, extra) => {
      const auth = requireOrgAdminMcp(extra);
      if (isError(auth)) return auth;

      switch (args.action) {
        case "get": {
          const [{ data: org }, { count: memberCount }, { data: domains }] = await Promise.all([
            supabaseAdmin.from("organizations").select("id, name, slug, is_personal, created_at").eq("id", auth.organizationId).single(),
            supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("organization_id", auth.organizationId),
            supabaseAdmin.from("organization_domains").select("id, domain, is_primary, created_at").eq("organization_id", auth.organizationId).order("is_primary", { ascending: false }),
          ]);

          if (!org) return err("Organization not found");

          return ok({
            id: org.id, name: org.name, slug: org.slug, isPersonal: org.is_personal,
            createdAt: org.created_at, memberCount: memberCount ?? 0,
            domains: (domains ?? []).map((d) => ({ id: d.id, domain: d.domain, isPrimary: d.is_primary, createdAt: d.created_at })),
            currentUserRole: auth.orgRole,
          });
        }

        case "update": {
          if (!args.name?.trim()) return err("name is required");
          const { error: updateErr } = await supabaseAdmin
            .from("organizations").update({ name: args.name.trim() }).eq("id", auth.organizationId);
          if (updateErr) return err(updateErr.message);
          return ok({ ok: true });
        }
      }
    }
  );
  toolMeta.set("admin_org", { integrationId: "admin:org", orgId: null });

  // ── admin_org_members ──
  server.tool(
    "admin_org_members",
    "List members of your organization.",
    {
      action: z.enum(["list"]),
    },
    async (_args, extra) => {
      const auth = requireOrgAdminMcp(extra);
      if (isError(auth)) return auth;

      const { data: members } = await supabaseAdmin
        .from("profiles")
        .select("id, name, org_role")
        .eq("organization_id", auth.organizationId)
        .order("name");

      return ok((members ?? []).map((m) => ({
        id: m.id, name: m.name, role: m.org_role,
      })));
    }
  );
  toolMeta.set("admin_org_members", { integrationId: "admin:org", orgId: null });

  // ── admin_org_domains ──
  server.tool(
    "admin_org_domains",
    "Manage organization email domains. Actions: list, add, remove.",
    {
      action: z.enum(["list", "add", "remove"]),
      domain: z.string().optional().describe("Domain to add (for add action)"),
      domain_id: z.string().optional().describe("Domain ID to remove (for remove action)"),
    },
    async (args, extra) => {
      const auth = requireOrgAdminMcp(extra);
      if (isError(auth)) return auth;

      switch (args.action) {
        case "list": {
          const { data: domains } = await supabaseAdmin
            .from("organization_domains")
            .select("id, domain, is_primary, created_at")
            .eq("organization_id", auth.organizationId)
            .order("is_primary", { ascending: false });

          return ok((domains ?? []).map((d) => ({ id: d.id, domain: d.domain, isPrimary: d.is_primary, createdAt: d.created_at })));
        }

        case "add": {
          if (!args.domain?.trim()) return err("domain is required");
          const normalizedDomain = args.domain.trim().toLowerCase();

          if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalizedDomain)) {
            return err("Invalid domain format");
          }

          const { data: isPersonal } = await supabaseAdmin.from("personal_email_domains").select("domain").eq("domain", normalizedDomain).single();
          if (isPersonal) return err("Personal email domains cannot be claimed");

          const { data: existing } = await supabaseAdmin.from("organization_domains").select("id").eq("domain", normalizedDomain).single();
          if (existing) return err("Domain is already claimed by another organization");

          const { count } = await supabaseAdmin.from("organization_domains").select("id", { count: "exact", head: true }).eq("organization_id", auth.organizationId);

          const { data: newDomain, error: addErr } = await supabaseAdmin
            .from("organization_domains")
            .insert({ organization_id: auth.organizationId, domain: normalizedDomain, is_primary: (count ?? 0) === 0 })
            .select("id, domain, is_primary, created_at")
            .single();

          if (addErr) return err(addErr.message);
          return ok({ id: newDomain.id, domain: newDomain.domain, isPrimary: newDomain.is_primary, createdAt: newDomain.created_at });
        }

        case "remove": {
          if (!args.domain_id) return err("domain_id is required");

          const { error: delErr } = await supabaseAdmin
            .from("organization_domains")
            .delete()
            .eq("id", args.domain_id)
            .eq("organization_id", auth.organizationId);

          if (delErr) return err(delErr.message);
          return ok({ ok: true });
        }
      }
    }
  );
  toolMeta.set("admin_org_domains", { integrationId: "admin:org", orgId: null });

  // ── admin_org_integrations ──
  server.tool(
    "admin_org_integrations",
    "Manage org-level proxy integrations (API keys & enabled status). Actions: list, configure, remove.",
    {
      action: z.enum(["list", "configure", "remove"]),
      integration_id: z.string().optional().describe("Integration ID (required for configure/remove)"),
      api_key: z.string().optional().describe("API key to set (for configure)"),
      enabled: z.boolean().optional().describe("Enable/disable toggle (for configure)"),
    },
    async (args, extra) => {
      const auth = requireOrgAdminMcp(extra);
      if (isError(auth)) return auth;

      switch (args.action) {
        case "list": {
          const orgOnlyIntegrations = allProxyIntegrations.filter((i) => i.keyMode === "org");

          const [{ data: orgKeys }, { data: dbTools }] = await Promise.all([
            supabaseAdmin.from("integration_org_keys").select("integration_id, enabled").eq("organization_id", auth.organizationId),
            supabaseAdmin.from("proxy_integration_tools").select("integration_id").eq("enabled", true),
          ]);

          const keyMap = new Map((orgKeys ?? []).map((k) => [k.integration_id, k.enabled]));
          const dbToolCounts = new Map<string, number>();
          for (const t of dbTools ?? []) {
            dbToolCounts.set(t.integration_id, (dbToolCounts.get(t.integration_id) ?? 0) + 1);
          }

          return ok(orgOnlyIntegrations.map((i) => ({
            id: i.id, name: i.name, description: i.description,
            toolCount: dbToolCounts.get(i.id) ?? (i.fallbackTools?.length ?? 0),
            configured: keyMap.has(i.id), enabled: keyMap.get(i.id) ?? false,
          })));
        }

        case "configure": {
          if (!args.integration_id) return err("integration_id is required");

          const valid = allProxyIntegrations.some((i) => i.id === args.integration_id && i.keyMode === "org");
          if (!valid) return err("Unknown integration");

          // Toggle only
          if (args.api_key === undefined && args.enabled !== undefined) {
            const { error: toggleErr } = await supabaseAdmin
              .from("integration_org_keys")
              .update({ enabled: args.enabled, updated_at: new Date().toISOString() })
              .eq("organization_id", auth.organizationId)
              .eq("integration_id", args.integration_id);

            if (toggleErr) return err("No key configured to toggle");
            return ok({ ok: true });
          }

          if (!args.api_key?.trim()) return err("api_key is required");

          const encrypted = encrypt(args.api_key.trim());
          const { error: upsertErr } = await supabaseAdmin
            .from("integration_org_keys")
            .upsert({
              organization_id: auth.organizationId,
              integration_id: args.integration_id,
              api_key: encrypted,
              enabled: args.enabled ?? true,
              updated_at: new Date().toISOString(),
            }, { onConflict: "organization_id,integration_id" });

          if (upsertErr) return err("Failed to save key");
          return ok({ ok: true });
        }

        case "remove": {
          if (!args.integration_id) return err("integration_id is required");

          await supabaseAdmin
            .from("integration_org_keys")
            .delete()
            .eq("organization_id", auth.organizationId)
            .eq("integration_id", args.integration_id);

          return ok({ ok: true });
        }
      }
    }
  );
  toolMeta.set("admin_org_integrations", { integrationId: "admin:org", orgId: null });

  // ═══════════════════════════════════════
  // Tier 2: Super Admin Tools (role = admin)
  // ═══════════════════════════════════════

  // ── admin_users ──
  server.tool(
    "admin_users",
    "Manage platform users. Actions: list, create, update, deactivate. Requires super admin.",
    {
      action: z.enum(["list", "create", "update", "deactivate"]),
      user_id: z.string().optional().describe("User ID (for update/deactivate)"),
      email: z.string().optional().describe("Email address (for create)"),
      name: z.string().optional().describe("Display name (for create)"),
      role: z.string().optional().describe("Platform role: admin or user (for create/update)"),
      permissions_mode: z.string().optional().describe("full or custom (for update)"),
      org_role: z.string().optional().describe("Org role: owner/admin/member (for update)"),
      remove_from_org: z.boolean().optional().describe("Move user to personal org (for update)"),
    },
    async (args, extra) => {
      const auth = requireSuperAdminMcp(extra);
      if (isError(auth)) return auth;

      switch (args.action) {
        case "list": {
          const { data, error: rpcErr } = await supabaseAdmin.rpc("get_admin_users");
          if (rpcErr) return err("Failed to fetch users");

          return ok((data ?? []).map((u: Record<string, unknown>) => ({
            id: u.id, name: u.name, email: u.email, role: u.role,
            status: u.status, permissionsMode: u.permissions_mode,
            organizationId: u.organization_id, orgRole: u.org_role, orgName: u.org_name,
            apiKeyCount: Number(u.api_key_count), connectionCount: Number(u.connection_count),
            requestCount: Number(u.request_count), lastActive: u.last_active ?? null,
          })));
        }

        case "create": {
          if (!args.email?.trim()) return err("email is required");
          const normalizedEmail = args.email.trim().toLowerCase();

          const { data: existing } = await supabaseAdmin.from("profiles").select("id").eq("email", normalizedEmail).single();
          if (existing) return err("A user with this email already exists");

          const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            email_confirm: true,
            user_metadata: { full_name: args.name?.trim() || null },
          });
          if (authErr || !authUser.user) return err(authErr?.message ?? "Failed to create user");

          await supabaseAdmin.from("profiles").update({
            role: args.role === "admin" ? "admin" : "user",
            status: "invited",
            name: args.name?.trim() || null,
          }).eq("id", authUser.user.id);

          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id, email, name, role, status, permissions_mode")
            .eq("id", authUser.user.id)
            .single();

          return ok(profile);
        }

        case "update": {
          if (!args.user_id) return err("user_id is required");

          if (args.role && args.role !== "admin" && args.user_id === auth.userId) {
            return err("Cannot demote yourself");
          }
          if (args.permissions_mode === "custom" && args.user_id === auth.userId) {
            return err("Cannot set your own permissions to custom");
          }

          if (args.remove_from_org) {
            if (args.user_id === auth.userId) return err("Cannot remove yourself from your organization");

            const slug = `personal-removed-${args.user_id.slice(0, 8)}-${Date.now()}`;
            const { data: newOrg } = await supabaseAdmin.from("organizations").insert({ name: "Personal", slug, is_personal: true }).select("id").single();
            if (!newOrg) return err("Failed to create personal org");

            await supabaseAdmin.from("profiles").update({ organization_id: newOrg.id, org_role: "owner" }).eq("id", args.user_id);
            return ok({ ok: true });
          }

          const data: Record<string, string> = {};
          if (args.role && (args.role === "user" || args.role === "admin")) data.role = args.role;
          if (args.permissions_mode && (args.permissions_mode === "full" || args.permissions_mode === "custom")) data.permissions_mode = args.permissions_mode;
          if (args.org_role && ["owner", "admin", "member"].includes(args.org_role)) data.org_role = args.org_role;

          if (Object.keys(data).length === 0) return err("No valid fields to update");

          const { data: updated, error: updateErr } = await supabaseAdmin
            .from("profiles").update(data).eq("id", args.user_id)
            .select("id, email, name, role, status, permissions_mode, org_role").single();

          if (updateErr || !updated) return err("Update failed");

          if (args.permissions_mode === "full") {
            await supabaseAdmin.from("user_integration_access").delete().eq("user_id", args.user_id);
          }

          return ok({ ...updated, permissionsMode: updated.permissions_mode, orgRole: updated.org_role });
        }

        case "deactivate": {
          if (!args.user_id) return err("user_id is required");
          if (args.user_id === auth.userId) return err("Cannot deactivate yourself");

          const { data: profile } = await supabaseAdmin.from("profiles").select("id").eq("id", args.user_id).single();
          if (!profile) return err("User not found");

          await supabaseAdmin.from("profiles").update({ status: "deactivated" }).eq("id", args.user_id);

          const now = new Date().toISOString();
          await supabaseAdmin.from("api_keys").update({ revoked_at: now }).eq("user_id", args.user_id).is("revoked_at", null);
          await supabaseAdmin.from("connections").delete().eq("user_id", args.user_id);

          return ok({ ok: true });
        }
      }
    }
  );
  toolMeta.set("admin_users", { integrationId: "admin:super", orgId: null });

  // ── admin_user_permissions ──
  server.tool(
    "admin_user_permissions",
    "View or set user permissions. Actions: get, set. Requires super admin.",
    {
      action: z.enum(["get", "set"]),
      user_id: z.string().describe("Target user ID"),
      permissions_mode: z.string().optional().describe("full, custom, or read_only (for set)"),
      integrations: z.array(z.object({
        integrationId: z.string(),
        allowedTools: z.array(z.string()),
      })).optional().describe("Integration access rules (for set with custom mode)"),
    },
    async (args, extra) => {
      const auth = requireSuperAdminMcp(extra);
      if (isError(auth)) return auth;

      switch (args.action) {
        case "get": {
          const { data: profile } = await supabaseAdmin.from("profiles").select("permissions_mode").eq("id", args.user_id).single();
          if (!profile) return err("User not found");

          const { data: accessRows } = await supabaseAdmin.from("user_integration_access").select("integration_id, allowed_tools").eq("user_id", args.user_id);
          const catalog = await getFullCatalog();

          return ok({
            permissionsMode: profile.permissions_mode,
            integrations: (accessRows ?? []).map((a) => ({ integrationId: a.integration_id, allowedTools: a.allowed_tools })),
            catalog: catalog.map((c) => ({ id: c.id, name: c.name, kind: c.kind, tools: c.tools.map((t) => t.name) })),
          });
        }

        case "set": {
          if (args.user_id === auth.userId) return err("Cannot modify your own permissions");
          if (!args.permissions_mode || !["full", "custom", "read_only"].includes(args.permissions_mode)) {
            return err("permissions_mode must be 'full', 'custom', or 'read_only'");
          }

          const { data: profile } = await supabaseAdmin.from("profiles").select("id").eq("id", args.user_id).single();
          if (!profile) return err("User not found");

          if (args.permissions_mode === "full" || args.permissions_mode === "read_only") {
            await supabaseAdmin.from("user_integration_access").delete().eq("user_id", args.user_id);
            await supabaseAdmin.from("profiles").update({ permissions_mode: args.permissions_mode }).eq("id", args.user_id);
            return ok({ permissionsMode: args.permissions_mode, integrations: [] });
          }

          // Custom mode
          const integrations = args.integrations ?? [];
          if (!Array.isArray(integrations)) return err("integrations must be an array");

          const validation = await validatePermissionsPayload(integrations);
          if (!validation.valid) return err(`Invalid permissions: ${validation.errors.join(", ")}`);

          await supabaseAdmin.from("user_integration_access").delete().eq("user_id", args.user_id);
          if (integrations.length > 0) {
            await supabaseAdmin.from("user_integration_access").insert(
              integrations.map((entry) => ({ user_id: args.user_id, integration_id: entry.integrationId, allowed_tools: entry.allowedTools }))
            );
          }
          await supabaseAdmin.from("profiles").update({ permissions_mode: "custom" }).eq("id", args.user_id);

          return ok({ permissionsMode: "custom", integrations });
        }
      }
    }
  );
  toolMeta.set("admin_user_permissions", { integrationId: "admin:super", orgId: null });

  // ── admin_usage ──
  server.tool(
    "admin_usage",
    "View usage statistics and logs. Actions: stats, logs. Requires super admin.",
    {
      action: z.enum(["stats", "logs"]),
      period: z.string().optional().describe("Time period: 24h, 7d, or 30d (default: 7d)"),
      page: z.number().optional().describe("Page number for logs (default: 1)"),
      limit: z.number().optional().describe("Items per page for logs (default: 50, max: 100)"),
      status: z.string().optional().describe("Filter logs by status"),
      tool: z.string().optional().describe("Filter logs by tool name"),
      user_id: z.string().optional().describe("Filter logs by user ID"),
      risk_level: z.string().optional().describe("Filter logs by risk level"),
    },
    async (args, extra) => {
      const auth = requireSuperAdminMcp(extra);
      if (isError(auth)) return auth;

      const period = args.period ?? "7d";
      const days = period === "24h" ? 1 : period === "30d" ? 30 : 7;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      switch (args.action) {
        case "stats": {
          const { data, error: rpcErr } = await supabaseAdmin.rpc("get_admin_stats", { since_date: since.toISOString() });
          if (rpcErr) return err("Failed to fetch stats");

          const stats = data as Record<string, unknown>;
          return ok({
            totalRequests: Number(stats.totalRequests),
            successCount: Number(stats.successCount),
            errorCount: Number(stats.errorCount),
            errorRate: Number(stats.totalRequests) > 0 ? Number(stats.errorCount) / Number(stats.totalRequests) : 0,
            activeUsers: Number(stats.activeUsers),
            activeKeys: Number(stats.activeKeys),
            timeSeries: (stats.timeSeries as Array<Record<string, unknown>>).map((r) => ({ date: String(r.date), count: Number(r.count), errors: Number(r.errors) })),
            topTools: (stats.topTools as Array<Record<string, unknown>>).map((r) => ({ toolName: r.toolName, count: Number(r.count) })),
            topUsers: (stats.topUsers as Array<Record<string, unknown>>).map((r) => ({ userId: r.userId, email: r.email, count: Number(r.count) })),
          });
        }

        case "logs": {
          const page = Math.max(1, args.page ?? 1);
          const limit = Math.min(100, Math.max(1, args.limit ?? 50));

          const { data, error: rpcErr } = await supabaseAdmin.rpc("get_admin_usage_logs", {
            since_date: since.toISOString(),
            filter_status: args.status || null,
            filter_tool: args.tool || null,
            filter_user_id: args.user_id || null,
            filter_risk_level: args.risk_level || null,
            page_offset: (page - 1) * limit,
            page_limit: limit,
          });

          if (rpcErr) return err("Failed to fetch usage logs");

          const result = data as { logs: Array<Record<string, unknown>>; total: number };
          return ok({
            logs: (result.logs ?? []).map((log) => ({
              id: log.id, userId: log.user_id, userEmail: log.user_email,
              apiKeyPrefix: log.api_key_prefix ?? null, toolName: log.tool_name,
              integrationId: log.integration_id, status: log.status,
              errorMessage: log.error_message, durationMs: log.duration_ms,
              riskLevel: log.risk_level ?? null, createdAt: log.created_at,
            })),
            total: Number(result.total), page, limit,
            totalPages: Math.ceil(Number(result.total) / limit),
          });
        }
      }
    }
  );
  toolMeta.set("admin_usage", { integrationId: "admin:super", orgId: null });

  // ── admin_mcp_servers ──
  server.tool(
    "admin_mcp_servers",
    "Manage global custom MCP servers. Actions: list, create, update, delete, discover, toggle_tools. Requires super admin.",
    {
      action: z.enum(["list", "create", "update", "delete", "discover", "toggle_tools"]),
      server_id: z.string().optional().describe("Server ID (for update/delete/discover/toggle_tools)"),
      name: z.string().optional().describe("Server name (for create/update)"),
      slug: z.string().optional().describe("URL slug (for create)"),
      description: z.string().optional().describe("Server description (for create/update)"),
      server_url: z.string().optional().describe("Server URL (for create/update)"),
      auth_type: z.string().optional().describe("Auth type: bearer or none (for create/update)"),
      shared_api_key: z.string().optional().describe("Shared API key (for create/update)"),
      key_mode: z.enum(["shared", "per_user"]).optional().describe("Key mode (for create/update)"),
      user_key_instructions: z.string().optional().describe("Instructions for per_user key mode"),
      status: z.string().optional().describe("Server status (for update)"),
      tools: z.array(z.object({
        toolName: z.string(),
        enabled: z.boolean(),
      })).optional().describe("Tools to toggle (for toggle_tools)"),
    },
    async (args, extra) => {
      const auth = requireSuperAdminMcp(extra);
      if (isError(auth)) return auth;

      switch (args.action) {
        case "list": {
          const { data: servers, error: listErr } = await supabaseAdmin
            .from("custom_mcp_servers")
            .select("*, custom_mcp_tools(id, tool_name, description, enabled)")
            .is("organization_id", null)
            .order("created_at", { ascending: true });

          if (listErr) return err(listErr.message);

          return ok((servers ?? []).map((s) => ({
            id: s.id, name: s.name, slug: s.slug, description: s.description,
            serverUrl: s.server_url, authType: s.auth_type, hasSharedKey: !!s.shared_api_key,
            keyMode: s.key_mode ?? "shared", userKeyInstructions: s.user_key_instructions ?? null,
            status: s.status, lastError: s.last_error, lastDiscoveredAt: s.last_discovered_at,
            createdAt: s.created_at,
            tools: (s.custom_mcp_tools ?? []).map((t: { id: string; tool_name: string; description: string; enabled: boolean }) => ({
              id: t.id, toolName: t.tool_name, description: t.description, enabled: t.enabled,
            })),
          })));
        }

        case "create": {
          if (!args.name || !args.slug || !args.server_url) return err("name, slug, and server_url are required");
          if (!/^[a-z0-9-]+$/.test(args.slug)) return err("slug must be lowercase alphanumeric with hyphens");

          const resolvedKeyMode = args.key_mode ?? "shared";
          const { data: server, error: insertErr } = await supabaseAdmin
            .from("custom_mcp_servers")
            .insert({
              name: args.name, slug: args.slug, description: args.description ?? "",
              server_url: args.server_url, auth_type: args.auth_type ?? "bearer",
              shared_api_key: resolvedKeyMode === "shared" && args.shared_api_key ? encrypt(args.shared_api_key) : null,
              key_mode: resolvedKeyMode,
              user_key_instructions: resolvedKeyMode === "per_user" ? (args.user_key_instructions ?? null) : null,
            })
            .select()
            .single();

          if (insertErr) {
            return err(insertErr.message.includes("duplicate") ? "A server with that slug or URL already exists" : insertErr.message);
          }

          let tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> = [];
          if (resolvedKeyMode === "per_user") {
            await supabaseAdmin.from("custom_mcp_servers").update({ status: "active" }).eq("id", server.id);
          } else {
            try {
              tools = await discoverTools(args.server_url, args.shared_api_key);
              if (tools.length > 0) {
                await supabaseAdmin.from("custom_mcp_tools").insert(
                  tools.map((t) => ({ server_id: server.id, tool_name: t.name, description: t.description, input_schema: t.inputSchema, enabled: false }))
                );
              }
              await supabaseAdmin.from("custom_mcp_servers").update({ last_discovered_at: new Date().toISOString(), status: "active", last_error: null }).eq("id", server.id);
            } catch (discoverErr) {
              const message = discoverErr instanceof Error ? discoverErr.message : "Discovery failed";
              await supabaseAdmin.from("custom_mcp_servers").update({ status: "error", last_error: message }).eq("id", server.id);
            }
          }

          return ok({
            id: server.id, name: server.name, slug: server.slug, serverUrl: server.server_url, status: server.status,
            tools: tools.map((t) => ({ toolName: t.name, description: t.description, enabled: false })),
          });
        }

        case "update": {
          if (!args.server_id) return err("server_id is required");

          const updates: Record<string, unknown> = {};
          if (args.name !== undefined) updates.name = args.name;
          if (args.description !== undefined) updates.description = args.description;
          if (args.server_url !== undefined) updates.server_url = args.server_url;
          if (args.auth_type !== undefined) updates.auth_type = args.auth_type;
          if (args.shared_api_key !== undefined) updates.shared_api_key = args.shared_api_key ? encrypt(args.shared_api_key) : null;
          if (args.status !== undefined) updates.status = args.status;
          if (args.key_mode !== undefined) {
            updates.key_mode = args.key_mode;
            if (args.key_mode === "per_user") {
              updates.shared_api_key = null;
              if (args.user_key_instructions !== undefined) updates.user_key_instructions = args.user_key_instructions;
            } else {
              updates.user_key_instructions = null;
            }
          } else if (args.user_key_instructions !== undefined) {
            updates.user_key_instructions = args.user_key_instructions;
          }

          if (Object.keys(updates).length === 0) return err("No fields to update");

          const { error: updateErr } = await supabaseAdmin.from("custom_mcp_servers").update(updates).eq("id", args.server_id);
          if (updateErr) return err(updateErr.message);
          return ok({ ok: true });
        }

        case "delete": {
          if (!args.server_id) return err("server_id is required");

          const { error: delErr } = await supabaseAdmin.from("custom_mcp_servers").delete().eq("id", args.server_id);
          if (delErr) return err(delErr.message);
          return ok({ ok: true });
        }

        case "discover": {
          if (!args.server_id) return err("server_id is required");

          const { data: server } = await supabaseAdmin
            .from("custom_mcp_servers")
            .select("id, server_url, shared_api_key, key_mode")
            .eq("id", args.server_id)
            .single();

          if (!server) return err("Server not found");

          let apiKey: string | undefined;
          if (server.shared_api_key) {
            apiKey = decrypt(server.shared_api_key);
          } else if (server.key_mode === "per_user") {
            const { data: userKey } = await supabaseAdmin
              .from("custom_mcp_user_keys")
              .select("api_key")
              .eq("user_id", auth.userId)
              .eq("server_id", args.server_id)
              .single();

            if (!userKey) return err("Add your personal API key first (via dashboard) before refreshing tools");
            apiKey = decrypt(userKey.api_key);
          }

          try {
            const tools = await discoverTools(server.server_url, apiKey);
            for (const tool of tools) {
              await supabaseAdmin.from("custom_mcp_tools").upsert(
                { server_id: args.server_id, tool_name: tool.name, description: tool.description, input_schema: tool.inputSchema },
                { onConflict: "server_id,tool_name" }
              );
            }
            await supabaseAdmin.from("custom_mcp_servers").update({ last_discovered_at: new Date().toISOString(), status: "active", last_error: null }).eq("id", args.server_id);

            return ok({ discovered: tools.length, tools: tools.map((t) => ({ toolName: t.name, description: t.description })) });
          } catch (discoverErr) {
            const message = discoverErr instanceof Error ? discoverErr.message : "Discovery failed";
            await supabaseAdmin.from("custom_mcp_servers").update({ status: "error", last_error: message }).eq("id", args.server_id);
            return err(message);
          }
        }

        case "toggle_tools": {
          if (!args.server_id) return err("server_id is required");
          if (!Array.isArray(args.tools)) return err("tools must be an array");

          const { data: server } = await supabaseAdmin.from("custom_mcp_servers").select("id").eq("id", args.server_id).single();
          if (!server) return err("Server not found");

          for (const tool of args.tools) {
            await supabaseAdmin
              .from("custom_mcp_tools")
              .update({ enabled: tool.enabled })
              .eq("server_id", args.server_id)
              .eq("tool_name", tool.toolName);
          }

          return ok({ ok: true, updated: args.tools.length });
        }
      }
    }
  );
  toolMeta.set("admin_mcp_servers", { integrationId: "admin:super", orgId: null });
}
