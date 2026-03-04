import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { proxyIntegrationRegistry } from "@/lib/integrations/proxy-registry";
import { discoverAndCacheProxyTools } from "@/lib/integrations/proxy-tools";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const proxy = proxyIntegrationRegistry.get(id);
  if (!proxy) {
    return NextResponse.json(
      { error: "Unknown proxy integration" },
      { status: 404 }
    );
  }

  // Optional API key from request body (for authenticated discovery)
  let apiKey: string | undefined;
  try {
    const body = await req.json();
    if (body.apiKey && typeof body.apiKey === "string") {
      apiKey = body.apiKey;
    }
  } catch {
    // No body or invalid JSON — proceed without key
  }

  try {
    const tools = await discoverAndCacheProxyTools(
      proxy.id,
      proxy.serverUrl,
      apiKey
    );
    return NextResponse.json({
      integrationId: proxy.id,
      toolCount: tools.length,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discovery failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
