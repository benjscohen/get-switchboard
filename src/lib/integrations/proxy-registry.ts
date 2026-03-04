import type { ProxyIntegrationConfig } from "./types";
import { firecrawlIntegration } from "./firecrawl";
import { granolaIntegration } from "./granola";
import { shortcutIntegration } from "./shortcut";
import { slackIntegration } from "./slack";

const proxyIntegrations: ProxyIntegrationConfig[] = [
  firecrawlIntegration,
  granolaIntegration,
  shortcutIntegration,
  slackIntegration,
];

export const proxyIntegrationRegistry = new Map<string, ProxyIntegrationConfig>(
  proxyIntegrations.map((i) => [i.id, i])
);

export const allProxyIntegrations = proxyIntegrations;
