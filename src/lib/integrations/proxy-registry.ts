import type { ProxyIntegrationConfig } from "./types";
import { context7Integration } from "./context7";
import { exaIntegration } from "./exa";
import { firecrawlIntegration } from "./firecrawl";
import { githubIntegration } from "./github";
import { granolaIntegration } from "./granola";
import { shortcutIntegration } from "./shortcut";
import { datadogIntegration } from "./datadog";
import { slackIntegration } from "./slack";
import { supabaseIntegration } from "./supabase";

const proxyIntegrations: ProxyIntegrationConfig[] = [
  context7Integration,
  datadogIntegration,
  exaIntegration,
  firecrawlIntegration,
  githubIntegration,
  granolaIntegration,
  shortcutIntegration,
  slackIntegration,
  supabaseIntegration,
];

export const proxyIntegrationRegistry = new Map<string, ProxyIntegrationConfig>(
  proxyIntegrations.map((i) => [i.id, i])
);

export const allProxyIntegrations = proxyIntegrations;
