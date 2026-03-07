import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const TIMEOUT_MS = 30_000;

type DiscoveredTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/** Either a Bearer token string, explicit headers dict, or undefined (no auth). */
export type ProxyAuth = string | { headers: Record<string, string> } | undefined;

function resolveAuthHeaders(auth: ProxyAuth): Record<string, string> {
  if (!auth) return {};
  if (typeof auth === "string") return { Authorization: `Bearer ${auth}` };
  return { ...auth.headers };
}

export async function discoverTools(
  serverUrl: string,
  auth?: ProxyAuth
): Promise<DiscoveredTool[]> {
  const client = new Client({ name: "switchboard-discovery", version: "1.0.0" });
  const headers = resolveAuthHeaders(auth);

  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: { headers },
  });

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);

  try {
    await client.connect(transport);
    const { tools } = await client.listTools(undefined, {
      signal: abort.signal,
    });
    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
    }));
  } finally {
    clearTimeout(timer);
    await client.close().catch(() => {});
  }
}

export async function proxyToolCall(
  serverUrl: string,
  auth: ProxyAuth,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const client = new Client({ name: "switchboard-proxy", version: "1.0.0" });
  const headers = resolveAuthHeaders(auth);

  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: { headers },
  });

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);

  try {
    await client.connect(transport);
    const result = await client.callTool(
      { name: toolName, arguments: args },
      undefined,
      { signal: abort.signal }
    );
    const rawContent = (result.content ?? []) as Array<Record<string, unknown>>;
    const content = rawContent.map((c) => {
      // TextContent: { type: "text", text: "..." }
      if (c.type === "text" && typeof c.text === "string") {
        return { type: "text" as const, text: c.text };
      }
      // EmbeddedResource: { type: "resource", resource: { text?: string, blob?: string, uri: string } }
      if (c.type === "resource" && c.resource && typeof c.resource === "object") {
        const res = c.resource as Record<string, unknown>;
        if (typeof res.text === "string") {
          return { type: "text" as const, text: res.text };
        }
        if (typeof res.blob === "string") {
          return { type: "text" as const, text: `[Base64 content: ${res.mimeType ?? "unknown type"}]\n${res.blob}` };
        }
        return { type: "text" as const, text: `[Resource: ${res.uri ?? "unknown"}]` };
      }
      // ImageContent / AudioContent: { type: "image"|"audio", data: "base64...", mimeType: "..." }
      if ((c.type === "image" || c.type === "audio") && typeof c.data === "string") {
        return { type: "text" as const, text: `[${c.type}: ${c.mimeType ?? "unknown type"}]` };
      }
      // ResourceLink: { type: "resource_link", uri: "...", name: "..." }
      if (c.type === "resource_link" && typeof c.uri === "string") {
        return { type: "text" as const, text: `[Resource link: ${c.name ?? c.uri}]` };
      }
      // Fallback: stringify anything else
      return { type: "text" as const, text: typeof c.text === "string" ? c.text : JSON.stringify(c) };
    });
    return {
      content,
      isError: Boolean(result.isError),
    };
  } catch (err) {
    // Enrich error messages with context about the upstream failure
    const raw = err instanceof Error ? err.message : String(err);

    // Check for JSON-RPC error responses embedded in the message
    if (raw.includes("abort") || raw.includes("AbortError")) {
      throw new Error(`Upstream MCP server at ${serverUrl} timed out after ${TIMEOUT_MS}ms`);
    }

    throw new Error(`Upstream MCP server error (${serverUrl}): ${raw}`);
  } finally {
    clearTimeout(timer);
    await client.close().catch(() => {});
  }
}
