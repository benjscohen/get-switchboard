import type { IntegrationConfig } from "./types";
import { googleCalendarIntegration } from "./google-calendar";
import { googleDocsIntegration } from "./google-docs";
import { googleGmailIntegration } from "./google-gmail";
import { googleSheetsIntegration } from "./google-sheets";

const integrations: IntegrationConfig[] = [
  googleCalendarIntegration,
  googleDocsIntegration,
  googleGmailIntegration,
  googleSheetsIntegration,
];

export const integrationRegistry = new Map<string, IntegrationConfig>(
  integrations.map((i) => [i.id, i])
);

export const allIntegrations = integrations;

export function getToolNamesForIntegration(integrationId: string): string[] {
  const integration = integrationRegistry.get(integrationId);
  if (!integration) return [];
  return integration.tools.map((t) => t.name);
}
