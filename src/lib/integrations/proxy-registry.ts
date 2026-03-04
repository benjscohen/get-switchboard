import type { ProxyIntegrationConfig } from "./types";
import { firecrawlIntegration } from "./firecrawl";
import { shortcutIntegration } from "./shortcut";

const proxyIntegrations: ProxyIntegrationConfig[] = [
  firecrawlIntegration,
  shortcutIntegration,
];

export const proxyIntegrationRegistry = new Map<string, ProxyIntegrationConfig>(
  proxyIntegrations.map((i) => [i.id, i])
);

export const allProxyIntegrations = proxyIntegrations;

export function getProxyToolNames(integrationId: string): string[] {
  const integration = proxyIntegrationRegistry.get(integrationId);
  if (!integration) return [];
  return integration.tools.map((t) => t.name);
}
