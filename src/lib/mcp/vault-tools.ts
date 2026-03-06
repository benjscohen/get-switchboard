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
} from "@/lib/vault/service";
import type { ToolMeta } from "@/lib/mcp/tool-filtering";
import { withToolLogging } from "@/lib/mcp/tool-logging";
import { getMcpAuth, unauthorized } from "@/lib/mcp/types";

function getVaultAuth(extra: Parameters<typeof getMcpAuth>[0]): { userId: string } | null {
  return getMcpAuth(extra);
}

export function registerVaultTools(
  server: McpServer,
  toolMeta: Map<string, ToolMeta>
) {
  // vault_list_secrets
  server.tool(
    "vault_list_secrets",
    "List all secrets in your vault (names, categories, tags, field names — no values)",
    {},
    withToolLogging("vault_list_secrets", "platform", async (_args, extra) => {
      const auth = getVaultAuth(extra);
      if (!auth) return unauthorized();

      const result = await listSecrets(auth);
      if (!result.ok) return { content: [{ type: "text" as const, text: result.error }], isError: true };
      return { content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }] };
    })
  );
  toolMeta.set("vault_list_secrets", { integrationId: "platform", orgId: null });

  // vault_get_secret
  server.tool(
    "vault_get_secret",
    "Get a secret by name or ID, returning all decrypted field values",
    {
      name: z.string().optional().describe("Secret name (use this or id)"),
      id: z.string().optional().describe("Secret UUID (use this or name)"),
    },
    withToolLogging("vault_get_secret", "platform", async (args, extra) => {
      const auth = getVaultAuth(extra);
      if (!auth) return unauthorized();

      if (!args.name && !args.id) {
        return { content: [{ type: "text" as const, text: "Provide either name or id" }], isError: true };
      }

      const result = args.id
        ? await getSecret(auth, args.id)
        : await getSecretByName(auth, args.name!);

      if (!result.ok) return { content: [{ type: "text" as const, text: result.error }], isError: true };
      return { content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }] };
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

      // Try to find existing secret by name
      const existing = await getSecretByName(auth, args.name);
      if (existing.ok) {
        const result = await updateSecret(auth, existing.data.id, {
          description: args.description,
          category: args.category,
          tags: args.tags,
          fields: args.fields,
        });
        if (!result.ok) return { content: [{ type: "text" as const, text: result.error }], isError: true };
        return { content: [{ type: "text" as const, text: `Secret "${args.name}" updated.\n\n${JSON.stringify(result.data, null, 2)}` }] };
      }

      const result = await createSecret(auth, {
        name: args.name,
        description: args.description,
        category: args.category,
        tags: args.tags,
        fields: args.fields,
      });
      if (!result.ok) return { content: [{ type: "text" as const, text: result.error }], isError: true };
      return { content: [{ type: "text" as const, text: `Secret "${args.name}" created.\n\n${JSON.stringify(result.data, null, 2)}` }] };
    })
  );
  toolMeta.set("vault_set_secret", { integrationId: "platform", orgId: null });

  // vault_delete_secret
  server.tool(
    "vault_delete_secret",
    "Delete a secret by name or ID. This cannot be undone.",
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
        if (!found.ok) return { content: [{ type: "text" as const, text: found.error }], isError: true };
        secretId = found.data.id;
      }
      if (!secretId) {
        return { content: [{ type: "text" as const, text: "Provide either name or id" }], isError: true };
      }

      const result = await deleteSecret(auth, secretId);
      if (!result.ok) return { content: [{ type: "text" as const, text: result.error }], isError: true };
      return { content: [{ type: "text" as const, text: "Secret deleted successfully." }] };
    })
  );
  toolMeta.set("vault_delete_secret", { integrationId: "platform", orgId: null });

  // vault_search_secrets
  server.tool(
    "vault_search_secrets",
    "Search secrets by name pattern, category, or tags (no field values returned)",
    {
      query: z.string().optional().describe("Search by name (partial match)"),
      category: z.enum(["api_key", "credential", "payment", "note", "other"]).optional().describe("Filter by category"),
      tags: z.array(z.string()).optional().describe("Filter by tags (any match)"),
    },
    withToolLogging("vault_search_secrets", "platform", async (args, extra) => {
      const auth = getVaultAuth(extra);
      if (!auth) return unauthorized();

      const result = await searchSecrets(auth, {
        query: args.query,
        category: args.category,
        tags: args.tags,
      });
      if (!result.ok) return { content: [{ type: "text" as const, text: result.error }], isError: true };
      return { content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }] };
    })
  );
  toolMeta.set("vault_search_secrets", { integrationId: "platform", orgId: null });
}
