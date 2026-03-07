import type { IntegrationConfig } from "./types";
import { asanaIntegration } from "./asana";
import { googleAdsIntegration } from "./google-ads";
import { googleCalendarIntegration } from "./google-calendar";
import { googleDocsIntegration } from "./google-docs";
import { googleDriveIntegration } from "./google-drive";
import { googleGmailIntegration } from "./google-gmail";
import { googleSheetsIntegration } from "./google-sheets";
import { googleSlidesIntegration } from "./google-slides";
import { hubspotCrmIntegration } from "./hubspot-crm";
import { intercomIntegration } from "./intercom";
import { linkedinAdsIntegration } from "./linkedin-ads";
import { railwayIntegration } from "./railway";

const integrations: IntegrationConfig[] = [
  asanaIntegration,
  googleAdsIntegration,
  googleCalendarIntegration,
  googleDocsIntegration,
  googleDriveIntegration,
  googleGmailIntegration,
  googleSheetsIntegration,
  googleSlidesIntegration,
  hubspotCrmIntegration,
  intercomIntegration,
  linkedinAdsIntegration,
  railwayIntegration,
];

export const integrationRegistry = new Map<string, IntegrationConfig>(
  integrations.map((i) => [i.id, i])
);

export const allIntegrations = integrations;

/** Integrations that require an org-level key before users can connect */
export function getOrgKeyIntegrations(): IntegrationConfig[] {
  return integrations.filter((i) => !!i.orgKeyRequired);
}

/** Check if an integration's OAuth credentials are configured in env */
export function isIntegrationConfigured(integration: IntegrationConfig): boolean {
  return !!process.env[integration.oauth.clientIdEnvVar];
}

export function getConfiguredIntegrations(): IntegrationConfig[] {
  return integrations.filter(isIntegrationConfigured);
}

export function getToolNamesForIntegration(integrationId: string): string[] {
  const integration = integrationRegistry.get(integrationId);
  if (!integration) return [];
  return integration.tools.map((t) => t.name);
}
