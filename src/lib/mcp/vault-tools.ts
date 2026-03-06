import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listSecrets,
  getSecret,
  getSecretByName,
  createSecret,
  updateSecret,
  deleteSecret,
  searchSecrets,
  shareSecret,
  unshareSecret,
  listShares,
} from "@/lib/vault/service";
import type { VaultAuth } from "@/lib/vault/service";
import type { ToolMeta } from "@/lib/mcp/tool-filtering";
import { withToolLogging } from "@/lib/mcp/tool-logging";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getMcpAuth, unauthorized } from "@/lib/mcp/types";
import type { McpAuthExtra } from "@/lib/mcp/types";

function getVaultAuth(extra: McpAuthExtra): VaultAuth | null {
  const base = getMcpAuth(extra);
  if (!base) return null;
  return {
    ...base,
    orgRole: extra.authInfo?.extra?.orgRole as string | undefined,
  };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/**
 * Resolve a user email to a user ID within the same organization.
 */
async function resolveEmail(email: string, organizationId?: string): Promise<string | null> {
  let q = supabaseAdmin.from("profiles").select("id").eq("email", email);
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data } = await q.single();
  return data?.id ?? null;
}

/**
 * Resolve a team name or slug to a team ID within the same organization.
 */
async function resolveTeam(nameOrSlug: string, organizationId?: string): Promise<string | null> {
  if (!organizationId) return null;
  // Try slug first, then name
  const { data: bySlug } = await supabaseAdmin
    .from("teams")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("slug", nameOrSlug)
    .single();
  if (bySlug) return bySlug.id;

  const { data: byName } = await supabaseAdmin
    .from("teams")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("name", nameOrSlug)
    .single();
  return byName?.id ?? null;
}

export function registerVaultTools(
  server: McpServer,
  toolMeta: Map<string, ToolMeta>
) {
  // vault_list_secrets
  server.tool(
    "vault_list_secrets",
    "List all secrets in your vault (names, categories, tags, field names — no values). Includes both owned and shared secrets by default.",
    {
      include: z.enum(["owned", "shared", "all"]).optional().describe("Filter: 'owned' (yours only), 'shared' (shared with you), or 'all' (default)"),
    },
    withToolLogging("vault_list_secrets", "platform", async (args, extra) => {
      const auth = getVaultAuth(extra);
      if (!auth) return unauthorized();

      const result = await listSecrets(auth, args.include ?? "all");
      if (!result.ok) return err(result.error);
      return ok(result.data);
    })
  );
  toolMeta.set("vault_list_secrets", { integrationId: "platform", orgId: null });

  // vault_get_secret
  server.tool(
    "vault_get_secret",
    "Get a secret by name or ID, returning all decrypted field values. Works for both owned and shared secrets.",
    {
      name: z.string().optional().describe("Secret name (use this or id)"),
      id: z.string().optional().describe("Secret UUID (use this or name)"),
    },
    withToolLogging("vault_get_secret", "platform", async (args, extra) => {
      const auth = getVaultAuth(extra);
      if (!auth) return unauthorized();

      if (!args.name && !args.id) {
        return err("Provide either name or id");
      }

      const result = args.id
        ? await getSecret(auth, args.id)
        : await getSecretByName(auth, args.name!);

      if (!result.ok) return err(result.error);
      return ok(result.data);
    })
  );
  toolMeta.set("vault_get_secret", { integrationId: "platform", orgId: null });

  // vault_set_secret
  server.tool(
    "vault_set_secret",
    "Create or update a secret (upsert by name). Provide fields as an array of {name, value, sensitive?}.",
    {
      name: z.string().describe("Secret name"),
      description: z.string().optional().describe("Optional description"),
      category: z.enum(["api_key", "credential", "payment", "note", "other"]).optional().describe("Category (default: other)"),
      tags: z.array(z.string()).optional().describe("Tags for organization"),
      fields: z.array(z.object({
        name: z.string().describe("Field name"),
        value: z.string().describe("Field value (will be encrypted)"),
        sensitive: z.boolean().optional().describe("Whether to mask in UI (default: true)"),
      })).describe("Secret fields"),
    },
    withToolLogging("vault_set_secret", "platform", async (args, extra) => {
      const auth = getVaultAuth(extra);
      if (!auth) return unauthorized();

      // Try to find existing secret by name (owned only for upsert)
      const existing = await getSecretByName(auth, args.name);
      if (existing.ok && existing.data.ownership !== "shared") {
        const result = await updateSecret(auth, existing.data.id, {
          description: args.description,
          category: args.category,
          tags: args.tags,
          fields: args.fields,
        });
        if (!result.ok) return err(result.error);
        return ok({ message: `Secret "${args.name}" updated.`, ...result.data });
      }

      const result = await createSecret(auth, {
        name: args.name,
        description: args.description,
        category: args.category,
        tags: args.tags,
        fields: args.fields,
      });
      if (!result.ok) return err(result.error);
      return ok({ message: `Secret "${args.name}" created.`, ...result.data });
    })
  );
  toolMeta.set("vault_set_secret", { integrationId: "platform", orgId: null });

  // vault_delete_secret
  server.tool(
    "vault_delete_secret",
    "Delete a secret by name or ID. This cannot be undone. Only the owner can delete.",
    {
      name: z.string().optional().describe("Secret name (use this or id)"),
      id: z.string().optional().describe("Secret UUID (use this or name)"),
    },
    withToolLogging("vault_delete_secret", "platform", async (args, extra) => {
      const auth = getVaultAuth(extra);
      if (!auth) return unauthorized();

      let secretId = args.id;
      if (!secretId && args.name) {
        const found = await getSecretByName(auth, args.name);
        if (!found.ok) return err(found.error);
        secretId = found.data.id;
      }
      if (!secretId) {
        return err("Provide either name or id");
      }

      const result = await deleteSecret(auth, secretId);
      if (!result.ok) return err(result.error);
      return ok({ message: "Secret deleted successfully." });
    })
  );
  toolMeta.set("vault_delete_secret", { integrationId: "platform", orgId: null });

  // vault_search_secrets
  server.tool(
    "vault_search_secrets",
    "Search secrets by name pattern, category, or tags (no field values returned). Includes shared secrets.",
    {
      query: z.string().optional().describe("Search by name (partial match)"),
      category: z.enum(["api_key", "credential", "payment", "note", "other"]).optional().describe("Filter by category"),
      tags: z.array(z.string()).optional().describe("Filter by tags (any match)"),
      include: z.enum(["owned", "shared", "all"]).optional().describe("Filter: 'owned', 'shared', or 'all' (default)"),
    },
    withToolLogging("vault_search_secrets", "platform", async (args, extra) => {
      const auth = getVaultAuth(extra);
      if (!auth) return unauthorized();

      const result = await searchSecrets(auth, {
        query: args.query,
        category: args.category,
        tags: args.tags,
        include: args.include,
      });
      if (!result.ok) return err(result.error);
      return ok(result.data);
    })
  );
  toolMeta.set("vault_search_secrets", { integrationId: "platform", orgId: null });

  // ── Sharing Tools ──

  // vault_share_secret
  server.tool(
    "vault_share_secret",
    "Share a vault secret with a user (by email), team (by name), or your entire organization. Recipients get read-only access to decrypted values.",
    {
      name: z.string().optional().describe("Secret name (use this or id)"),
      id: z.string().optional().describe("Secret UUID (use this or name)"),
      share_with_email: z.string().optional().describe("Email of the user to share with"),
      share_with_team: z.string().optional().describe("Team name or slug to share with"),
      share_with_org: z.boolean().optional().describe("Set to true to share with your entire organization"),
    },
    withToolLogging("vault_share_secret", "platform", async (args, extra) => {
      const auth = getVaultAuth(extra);
      if (!auth) return unauthorized();

      // Resolve secret
      let secretId = args.id;
      if (!secretId && args.name) {
        const found = await getSecretByName(auth, args.name);
        if (!found.ok) return err(found.error);
        secretId = found.data.id;
      }
      if (!secretId) return err("Provide either name or id");

      // Resolve target
      const targets = [args.share_with_email, args.share_with_team, args.share_with_org].filter(Boolean);
      if (targets.length !== 1) {
        return err("Provide exactly one of: share_with_email, share_with_team, or share_with_org");
      }

      if (args.share_with_email) {
        const userId = await resolveEmail(args.share_with_email, auth.organizationId);
        if (!userId) return err(`User not found: ${args.share_with_email}`);
        const result = await shareSecret(auth, secretId, { user_id: userId });
        if (!result.ok) return err(result.error);
        return ok({ message: `Shared with ${args.share_with_email}`, share: result.data });
      }

      if (args.share_with_team) {
        const teamId = await resolveTeam(args.share_with_team, auth.organizationId);
        if (!teamId) return err(`Team not found: ${args.share_with_team}`);
        const result = await shareSecret(auth, secretId, { team_id: teamId });
        if (!result.ok) return err(result.error);
        return ok({ message: `Shared with team "${args.share_with_team}"`, share: result.data });
      }

      if (args.share_with_org) {
        if (!auth.organizationId) return err("No organization found");
        const result = await shareSecret(auth, secretId, { organization_id: auth.organizationId });
        if (!result.ok) return err(result.error);
        return ok({ message: "Shared with your organization", share: result.data });
      }

      return err("No share target specified");
    })
  );
  toolMeta.set("vault_share_secret", { integrationId: "platform", orgId: null });

  // vault_unshare_secret
  server.tool(
    "vault_unshare_secret",
    "Revoke a share on a vault secret. Provide the share ID to revoke.",
    {
      name: z.string().optional().describe("Secret name (use this or id)"),
      id: z.string().optional().describe("Secret UUID (use this or name)"),
      share_id: z.string().describe("The share ID to revoke (from vault_list_shares)"),
    },
    withToolLogging("vault_unshare_secret", "platform", async (args, extra) => {
      const auth = getVaultAuth(extra);
      if (!auth) return unauthorized();

      let secretId = args.id;
      if (!secretId && args.name) {
        const found = await getSecretByName(auth, args.name);
        if (!found.ok) return err(found.error);
        secretId = found.data.id;
      }
      if (!secretId) return err("Provide either name or id");

      const result = await unshareSecret(auth, secretId, args.share_id);
      if (!result.ok) return err(result.error);
      return ok({ message: "Share revoked successfully." });
    })
  );
  toolMeta.set("vault_unshare_secret", { integrationId: "platform", orgId: null });

  // vault_list_shares
  server.tool(
    "vault_list_shares",
    "List all shares for a vault secret — shows who has access and how it was shared.",
    {
      name: z.string().optional().describe("Secret name (use this or id)"),
      id: z.string().optional().describe("Secret UUID (use this or name)"),
    },
    withToolLogging("vault_list_shares", "platform", async (args, extra) => {
      const auth = getVaultAuth(extra);
      if (!auth) return unauthorized();

      let secretId = args.id;
      if (!secretId && args.name) {
        const found = await getSecretByName(auth, args.name);
        if (!found.ok) return err(found.error);
        secretId = found.data.id;
      }
      if (!secretId) return err("Provide either name or id");

      const result = await listShares(auth, secretId);
      if (!result.ok) return err(result.error);
      return ok(result.data);
    })
  );
  toolMeta.set("vault_list_shares", { integrationId: "platform", orgId: null });
}
