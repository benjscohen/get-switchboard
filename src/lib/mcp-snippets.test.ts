import { MCP_CLIENTS, generateSnippet } from "@/lib/mcp-snippets";

describe("MCP_CLIENTS", () => {
  it("has 3 entries", () => {
    expect(MCP_CLIENTS).toHaveLength(3);
  });

  it("each entry has label, id, and hint properties", () => {
    for (const client of MCP_CLIENTS) {
      expect(client).toHaveProperty("label");
      expect(client).toHaveProperty("id");
      expect(client).toHaveProperty("hint");
    }
  });
});

describe("generateSnippet", () => {
  const origin = "https://example.com";
  const apiKey = "sk_live_test123";

  it("claude-desktop returns valid JSON with mcpServers.switchboard using mcp-remote", () => {
    const snippet = generateSnippet(origin, apiKey, "claude-desktop");
    const parsed = JSON.parse(snippet);
    const server = parsed.mcpServers.switchboard;
    expect(server.command).toBe("npx");
    expect(server.args).toContain("mcp-remote");
    expect(server.args).toContain(`${origin}/api/mcp/http`);
    expect(server.env.AUTH_HEADER).toBe(`Bearer ${apiKey}`);
  });

  it("claude-code returns a CLI command string containing 'claude mcp add'", () => {
    const snippet = generateSnippet(origin, apiKey, "claude-code");
    expect(snippet).toContain("claude mcp add");
    expect(snippet).not.toMatch(/^\{/); // not JSON
  });

  it("cursor returns valid JSON with the same shape as claude-desktop", () => {
    const snippet = generateSnippet(origin, apiKey, "cursor");
    const parsed = JSON.parse(snippet);
    expect(parsed.mcpServers.switchboard.url).toBe(`${origin}/api/mcp/http`);
    expect(parsed.mcpServers.switchboard.headers.Authorization).toBe(
      `Bearer ${apiKey}`
    );
  });

  it("returns empty string for unknown clientId", () => {
    expect(generateSnippet(origin, apiKey, "unknown")).toBe("");
  });

  it("URL contains origin + /api/mcp/http in args", () => {
    const snippet = generateSnippet(origin, apiKey, "claude-desktop");
    const parsed = JSON.parse(snippet);
    expect(parsed.mcpServers.switchboard.args).toContain(
      "https://example.com/api/mcp/http"
    );
  });

  it("Authorization header contains Bearer + apiKey", () => {
    const snippet = generateSnippet(origin, apiKey, "cursor");
    const parsed = JSON.parse(snippet);
    expect(parsed.mcpServers.switchboard.headers.Authorization).toContain(
      "Bearer"
    );
    expect(parsed.mcpServers.switchboard.headers.Authorization).toContain(
      apiKey
    );
  });
});
