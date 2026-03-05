import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const TIMEOUT_MS = 30_000;

type DiscoveredTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export async function discoverTools(
  serverUrl: string,
  apiKey?: string
): Promise<DiscoveredTool[]> {
  const client = new Client({ name: "switchboard-discovery", version: "1.0.0" });
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

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
  apiKey: string | undefined,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const client = new Client({ name: "switchboard-proxy", version: "1.0.0" });
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

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
    const content = ((result.content ?? []) as Array<{ type: string; text: string }>).map(
      (c) => ({ type: "text" as const, text: c.text ?? "" })
    );
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
