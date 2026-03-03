// TODO: Re-implement MCP endpoint route handler
// Previously used createMcpHandler from "mcp-handler" with withMcpAuth for bearer token auth
// AuthInfo available in tool callbacks via extra.authInfo?.extra?.userId
// See mcp-handler v1.0.7 docs for API

export async function GET() {
  return new Response("MCP endpoint — not yet implemented", { status: 501 });
}

export async function POST() {
  return new Response("MCP endpoint — not yet implemented", { status: 501 });
}
