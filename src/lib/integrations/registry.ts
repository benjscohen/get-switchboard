import type { IntegrationConfig } from "./types";
import { googleCalendarIntegration } from "./google-calendar";

const integrations: IntegrationConfig[] = [googleCalendarIntegration];

export const integrationRegistry = new Map<string, IntegrationConfig>(
  integrations.map((i) => [i.id, i])
);

export const allIntegrations = integrations;
