import type { IntegrationConfig } from "./types";
import { asanaIntegration } from "./asana";
import { googleCalendarIntegration } from "./google-calendar";
import { googleDocsIntegration } from "./google-docs";
import { googleGmailIntegration } from "./google-gmail";
import { googleSheetsIntegration } from "./google-sheets";
import { googleSlidesIntegration } from "./google-slides";

const integrations: IntegrationConfig[] = [
  asanaIntegration,
  googleCalendarIntegration,
  googleDocsIntegration,
  googleGmailIntegration,
  googleSheetsIntegration,
  googleSlidesIntegration,
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
