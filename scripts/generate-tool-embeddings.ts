/**
 * Generate tool embeddings and store them in the tool_embeddings table.
 *
 * Usage: npx tsx scripts/generate-tool-embeddings.ts
 *
 * Requires OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";
import { allIntegrations } from "@/lib/integrations/registry";
import { allProxyIntegrations } from "@/lib/integrations/proxy-registry";
import { buildSearchText, CATEGORY_MAP, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "@/lib/mcp/tool-search";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY environment variable is required");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BATCH_SIZE = 50;

type ToolEntry = {
  name: string;
  description: string;
  integrationId: string;
  integrationName: string;
};

function collectTools(): ToolEntry[] {
  const tools: ToolEntry[] = [];

  for (const integration of allIntegrations) {
    for (const tool of integration.tools) {
      tools.push({
        name: tool.name,
        description: tool.description,
        integrationId: integration.id,
        integrationName: integration.name,
      });
    }
  }

  for (const integration of allProxyIntegrations) {
    if (integration.fallbackTools) {
      for (const tool of integration.fallbackTools) {
        tools.push({
          name: tool.name,
          description: tool.description,
          integrationId: integration.id,
          integrationName: integration.name,
        });
      }
    }
  }

  const platformTools = [
    { name: "submit_feedback", description: "Submit feedback about Switchboard" },
    { name: "list_skills", description: "List available skills and automations" },
    { name: "get_skill", description: "Get details of a specific skill" },
    { name: "create_skill", description: "Create a new skill" },
    { name: "update_skill", description: "Update an existing skill" },
    { name: "delete_skill", description: "Delete a skill" },
  ];
  for (const tool of platformTools) {
    tools.push({ name: tool.name, description: tool.description, integrationId: "platform", integrationName: "Platform" });
  }

  const vaultTools = [
    { name: "vault_list_secrets", description: "List all secrets in the vault" },
    { name: "vault_get_secret", description: "Get a specific secret from the vault" },
    { name: "vault_set_secret", description: "Set or update a secret in the vault" },
    { name: "vault_delete_secret", description: "Delete a secret from the vault" },
    { name: "vault_search_secrets", description: "Search for secrets in the vault" },
  ];
  for (const tool of vaultTools) {
    tools.push({ name: tool.name, description: tool.description, integrationId: "vault", integrationName: "Vault" });
  }

  return tools;
}

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts, dimensions: EMBEDDING_DIMENSIONS }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const sorted = data.data.sort(
    (a: { index: number }, b: { index: number }) => a.index - b.index
  );
  return sorted.map((d: { embedding: number[] }) => d.embedding);
}

async function main() {
  console.log("Collecting tools...");
  const tools = collectTools();
  console.log(`Found ${tools.length} tools`);

  let upserted = 0;

  for (let i = 0; i < tools.length; i += BATCH_SIZE) {
    const batch = tools.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tools.length / BATCH_SIZE);

    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} tools)...`);

    const texts = batch.map((t) => {
      const category = CATEGORY_MAP[t.integrationId] ?? "other";
      return buildSearchText(t.name, t.description, t.integrationName, category);
    });

    const embeddings = await getEmbeddings(texts);

    const rows = batch.map((tool, j) => ({
      tool_name: tool.name,
      description: tool.description,
      integration_id: tool.integrationId,
      integration_name: tool.integrationName,
      search_text: texts[j],
      embedding: `[${embeddings[j].join(",")}]`,
      model: EMBEDDING_MODEL,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("tool_embeddings")
      .upsert(rows, { onConflict: "tool_name" });

    if (error) {
      console.error(`  Batch error:`, error.message);
    } else {
      upserted += rows.length;
    }
  }

  console.log(`\nDone! Upserted ${upserted} tool embeddings to database.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
