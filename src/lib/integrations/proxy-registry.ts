import type { ProxyIntegrationConfig } from "./types";
import { firecrawlIntegration } from "./firecrawl";
import { granolaIntegration } from "./granola";
import { shortcutIntegration } from "./shortcut";

const proxyIntegrations: ProxyIntegrationConfig[] = [
  firecrawlIntegration,
  granolaIntegration,
  shortcutIntegration,
];

export const proxyIntegrationRegistry = new Map<string, ProxyIntegrationConfig>(
  proxyIntegrations.map((i) => [i.id, i])
);

export const allProxyIntegrations = proxyIntegrations;
