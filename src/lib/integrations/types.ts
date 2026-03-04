import { z } from "zod";
import type { ReactNode } from "react";

export type CatalogEntry = {
  id: string;
  name: string;
  description: string;
  kind: "builtin" | "custom-mcp";
  toolCount: number;
  tools: { name: string; description: string }[];
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
