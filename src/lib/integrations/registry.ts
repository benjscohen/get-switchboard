import type { IntegrationConfig } from "./types";
import { asanaIntegration } from "./asana";
import { googleAdsIntegration } from "./google-ads";
import { googleCalendarIntegration } from "./google-calendar";
import { googleDocsIntegration } from "./google-docs";
import { googleDriveIntegration } from "./google-drive";
import { googleGmailIntegration } from "./google-gmail";
import { googleSheetsIntegration } from "./google-sheets";
import { googleSlidesIntegration } from "./google-slides";
import { intercomIntegration } from "./intercom";

const integrations: IntegrationConfig[] = [
  asanaIntegration,
  googleAdsIntegration,
  googleCalendarIntegration,
  googleDocsIntegration,
  googleDriveIntegration,
  googleGmailIntegration,
  googleSheetsIntegration,
  googleSlidesIntegration,
  intercomIntegration,
];

export const integrationRegistry = new Map<string, IntegrationConfig>(
  integrations.map((i) => [i.id, i])
);

export const allIntegrations = integrations;

/** Integrations that require an org-level key before users can connect */
export function getOrgKeyIntegrations(): IntegrationConfig[] {
  return integrations.filter((i) => !!i.orgKeyRequired);
}

export function getToolNamesForIntegration(integrationId: string): string[] {
  const integration = integrationRegistry.get(integrationId);
  if (!integration) return [];
  return integration.tools.map((t) => t.name);
}
