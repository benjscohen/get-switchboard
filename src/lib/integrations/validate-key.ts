import { discoverTools, type ProxyAuth } from "@/lib/mcp/proxy-client";

type DiscoveredTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ValidationResult =
  | { valid: true; discoveredTools?: DiscoveredTool[] }
  | { valid: false; error: string };

export async function validateIntegrationKey(
  integrationId: string,
  apiKey: string,
  context: {
    type: "proxy" | "org" | "custom-mcp";
    serverUrl?: string;
    customHeaders?: Record<string, string>;
  }
): Promise<ValidationResult> {
  switch (integrationId) {
    case "github":
      return validateGitHubToken(apiKey);
    case "shortcut":
      return validateShortcutToken(apiKey);
    case "supabase":
      return validateSupabaseToken(apiKey);
    case "google-ads":
      return validateGoogleAdsDevToken(apiKey);
    default:
      // Proxy/org MCP integrations — validate via tool discovery
      if (context.serverUrl) {
        const auth: ProxyAuth = context.customHeaders
          ? { headers: context.customHeaders }
          : apiKey;
        return validateMcpDiscovery(context.serverUrl, auth, integrationId);
      }
      // No known validator — skip validation
      return { valid: true };
  }
}

async function validateGitHubToken(token: string): Promise<ValidationResult> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "Switchboard",
      },
    });
    if (res.ok) return { valid: true };
    if (res.status === 401)
      return { valid: false, error: "Invalid GitHub token. Please check your Personal Access Token." };
    if (res.status === 403)
      return { valid: false, error: "GitHub token lacks required permissions." };
    return { valid: false, error: `GitHub returned unexpected status ${res.status}. Please try again.` };
  } catch {
    return { valid: false, error: "Could not reach GitHub to verify the token. Please try again." };
  }
}

async function validateShortcutToken(token: string): Promise<ValidationResult> {
  try {
    const res = await fetch("https://api.app.shortcut.com/api/v3/member", {
      headers: { "Shortcut-Token": token },
    });
    if (res.ok) return { valid: true };
    if (res.status === 401 || res.status === 403)
      return { valid: false, error: "Invalid Shortcut API token." };
    return { valid: false, error: `Shortcut returned unexpected status ${res.status}. Please try again.` };
  } catch {
    return { valid: false, error: "Could not reach Shortcut to verify the token. Please try again." };
  }
}

async function validateSupabaseToken(token: string): Promise<ValidationResult> {
  try {
    const res = await fetch("https://api.supabase.com/v1/projects", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return { valid: true };
    if (res.status === 401 || res.status === 403)
      return { valid: false, error: "Invalid Supabase access token." };
    return { valid: false, error: `Supabase returned unexpected status ${res.status}. Please try again.` };
  } catch {
    return { valid: false, error: "Could not reach Supabase to verify the token. Please try again." };
  }
}

function validateGoogleAdsDevToken(token: string): ValidationResult {
  if (/^[\w-]{10,}$/.test(token)) return { valid: true };
  return { valid: false, error: "Invalid developer token format." };
}

async function validateMcpDiscovery(
  serverUrl: string,
  auth: ProxyAuth,
  integrationId: string
): Promise<ValidationResult> {
  try {
    const tools = await discoverTools(serverUrl, auth);
    return { valid: true, discoveredTools: tools };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/401|403|[Uu]nauthorized|[Ff]orbidden|authentication/i.test(msg)) {
      return {
        valid: false,
        error: `Authentication failed for ${integrationId}. Please check your API key.`,
      };
    }
    return {
      valid: false,
      error: `Could not reach ${integrationId} to verify the key. Please try again.`,
    };
  }
}
