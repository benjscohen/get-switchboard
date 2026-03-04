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
