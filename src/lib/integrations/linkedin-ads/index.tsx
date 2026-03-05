import type { IntegrationConfig, IntegrationToolDef } from "../types";
import { LINKEDIN_ADS_TOOLS, type LinkedInAdsClient } from "./tools";

function LinkedInAdsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <rect width="18" height="18" rx="2" fill="#0A66C2" />
      <path
        d="M4.5 7.5h1.8v5.4H4.5V7.5zm.9-2.7a1.05 1.05 0 110 2.1 1.05 1.05 0 010-2.1zm2.7 2.7h1.7v.74h.03c.24-.45.82-.93 1.68-.93 1.8 0 2.13 1.18 2.13 2.72v3.13h-1.8V10.5c0-.65-.01-1.49-.91-1.49-.91 0-1.05.71-1.05 1.44v2.71H8.1V7.5z"
        fill="#fff"
      />
    </svg>
  );
}

const tools: IntegrationToolDef[] = LINKEDIN_ADS_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  schema: t.schema,
  execute: (args: Record<string, unknown>, client: unknown) =>
    t.execute(args, client as LinkedInAdsClient),
}));

export const linkedinAdsIntegration: IntegrationConfig = {
  id: "linkedin-ads",
  name: "LinkedIn Ads",
  description:
    "Manage campaigns, creatives, targeting, analytics, and lead gen forms in LinkedIn Marketing",
  icon: LinkedInAdsIcon,
  oauth: {
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    clientIdEnvVar: "LINKEDIN_ADS_CLIENT_ID",
    clientSecretEnvVar: "LINKEDIN_ADS_CLIENT_SECRET",
    scopes: ["r_ads", "rw_ads", "r_basicprofile"],
    extraAuthParams: { response_type: "code" },
  },
  createClient(tokens) {
    return {
      baseUrl: "https://api.linkedin.com/rest",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": "202511",
      },
    } satisfies LinkedInAdsClient;
  },
  tools,
  toolCount: tools.length,
};
