import type { IntegrationConfig, IntegrationToolDef } from "../types";
import { INTERCOM_TOOLS, type IntercomClient } from "./tools";

function IntercomIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <rect width="18" height="18" rx="4" fill="#1F8DED" />
      <path
        d="M13.5 11.7c0 .17-.14.3-.3.3-.1 0-.18-.04-.24-.12A5.98 5.98 0 0 1 9 13.2a5.98 5.98 0 0 1-3.96-1.32.3.3 0 0 1-.04-.42.3.3 0 0 1 .42-.04A5.38 5.38 0 0 0 9 12.6c1.32 0 2.58-.46 3.58-1.18a.3.3 0 0 1 .42.04c.06.07.1.15.1.24ZM5.4 6.6a.6.6 0 0 1 .6.6v2.4a.6.6 0 1 1-1.2 0V7.2a.6.6 0 0 1 .6-.6Zm2.4-.6a.6.6 0 0 1 .6.6v3a.6.6 0 1 1-1.2 0v-3a.6.6 0 0 1 .6-.6Zm2.4 0a.6.6 0 0 1 .6.6v3a.6.6 0 1 1-1.2 0v-3a.6.6 0 0 1 .6-.6Zm2.4.6a.6.6 0 0 1 .6.6v2.4a.6.6 0 1 1-1.2 0V7.2a.6.6 0 0 1 .6-.6Z"
        fill="#FFF"
      />
    </svg>
  );
}

const tools: IntegrationToolDef[] = INTERCOM_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  schema: t.schema,
  execute: (args: Record<string, unknown>, client: unknown) =>
    t.execute(args, client as IntercomClient),
}));

export const intercomIntegration: IntegrationConfig = {
  id: "intercom",
  name: "Intercom",
  description:
    "Manage contacts, companies, conversations, tickets, tags, and events in Intercom",
  icon: IntercomIcon,
  oauth: {
    authUrl: "https://app.intercom.com/oauth",
    tokenUrl: "https://api.intercom.io/auth/eagle/token",
    clientIdEnvVar: "INTERCOM_CLIENT_ID",
    clientSecretEnvVar: "INTERCOM_CLIENT_SECRET",
    scopes: [],
    extraAuthParams: {},
  },
  createClient(tokens) {
    return {
      accessToken: tokens.accessToken,
      baseUrl: "https://api.intercom.io",
    } satisfies IntercomClient;
  },
  tools,
  toolCount: tools.length,
};
