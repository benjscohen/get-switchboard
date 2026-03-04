import { z } from "zod";
import type { ReactNode } from "react";

export type CatalogEntry = {
  id: string;
  name: string;
  description: string;
  kind: "builtin" | "custom-mcp" | "native-proxy";
  toolCount: number;
  tools: { name: string; description: string }[];
};

export type ProxyOAuthConfig = {
  authUrl: string;
  tokenUrl: string;
  registrationUrl?: string; // DCR endpoint (optional if using static credentials)
  clientIdEnvVar?: string; // Env var for client ID (static OAuth)
  clientSecretEnvVar?: string; // Env var for client secret (static OAuth)
  scopes: string[];
  scopeParamName?: string; // Override "scope" param name (e.g. "user_scope" for Slack)
};

export type ProxyIntegrationConfig = {
  id: string;
  name: string;
  description: string;
  icon: () => ReactNode;
  serverUrl: string;
  keyMode: "org" | "per_user";
  userKeyInstructions?: ReactNode;
  oauth?: ProxyOAuthConfig;
  // Optional fallback — used only if no DB rows exist yet
  fallbackTools?: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
};

export type IntegrationToolDef = {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  execute: (
    args: Record<string, unknown>,
    client: unknown
  ) => Promise<unknown>;
};

export type OAuthConfig = {
  authUrl: string;
  tokenUrl: string;
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
  scopes: string[];
  extraAuthParams?: Record<string, string>;
};

export type IntegrationConfig = {
  id: string;
  name: string;
  description: string;
  icon: () => ReactNode;
  oauth: OAuthConfig;
  createClient: (tokens: { accessToken: string; refreshToken?: string }) => unknown;
  tools: IntegrationToolDef[];
  toolCount: number;
};

export type LocalIntegrationConfig = {
  id: string;
  name: string;
  description: string;
  icon: () => ReactNode;
  setupInstructions: ReactNode;
  tools: { name: string; description: string }[];
};

export type McpContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export type McpToolResult = {
  _mcpContent: McpContentBlock[];
};
