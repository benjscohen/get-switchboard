import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getFullCatalog } from "@/lib/integrations/catalog";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const [catalog, supabase] = await Promise.all([
    getFullCatalog(),
    createClient(),
  ]);

  // Query user connections and org keys in parallel
  const [connectionsRes, orgKeysRes, proxyUserKeysRes] = await Promise.all([
    supabase.from("connections").select("integration_id").eq("user_id", auth.userId),
    supabaseAdmin
      .from("integration_org_keys")
      .select("integration_id")
      .eq("organization_id", auth.organizationId)
      .eq("enabled", true),
    supabaseAdmin
      .from("proxy_user_keys")
      .select("integration_id")
      .eq("user_id", auth.userId),
  ]);

  const connectedIds = new Set(
    (connectionsRes.data ?? []).map((c) => c.integration_id as string)
  );
  const orgKeyIds = new Set(
    (orgKeysRes.data ?? []).map((k) => k.integration_id as string)
  );
  const proxyUserKeyIds = new Set(
    (proxyUserKeysRes.data ?? []).map((k) => k.integration_id as string)
  );

  const integrations = catalog.map((entry) => {
    let connected = false;

    if (entry.kind === "platform") {
      connected = true;
    } else if (entry.kind === "builtin") {
      connected = connectedIds.has(entry.id);
    } else if (entry.kind === "native-proxy") {
      const proxyId = entry.id.replace("proxy:", "");
      connected = orgKeyIds.has(proxyId) || proxyUserKeyIds.has(proxyId) || connectedIds.has(proxyId);
    } else if (entry.kind === "custom-mcp") {
      connected = true; // Custom MCP servers are always available if active
    }

    // Use the bare integration ID for tool_access (strip proxy: prefix)
    const toolAccessId = entry.id.startsWith("proxy:") ? entry.id.replace("proxy:", "") : entry.id;

    return {
      id: toolAccessId,
      name: entry.name,
      description: entry.description,
      kind: entry.kind,
      category: entry.category ?? "other",
      connected,
      toolCount: entry.toolCount,
      tools: entry.tools,
    };
  });

  return NextResponse.json({ integrations });
}
