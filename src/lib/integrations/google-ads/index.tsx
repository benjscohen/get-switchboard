import type { IntegrationConfig, IntegrationToolDef } from "../types";
import { GOOGLE_ADS_TOOLS, type GoogleAdsClient } from "./tools";

function GoogleAdsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <path
        d="M11.7 1.35l-5.4 9.36a2.7 2.7 0 104.68 2.7l5.4-9.36a2.7 2.7 0 10-4.68-2.7z"
        fill="#FBBC04"
      />
      <path
        d="M6.3 1.35l-5.4 9.36a2.7 2.7 0 104.68 2.7l5.4-9.36a2.7 2.7 0 10-4.68-2.7z"
        fill="#4285F4"
      />
      <circle cx="3.6" cy="13.5" r="2.7" fill="#34A853" />
    </svg>
  );
}

const tools: IntegrationToolDef[] = GOOGLE_ADS_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  schema: t.schema,
  execute: (args: Record<string, unknown>, client: unknown) =>
    t.execute(args, client as GoogleAdsClient),
}));

export const googleAdsIntegration: IntegrationConfig = {
  id: "google-ads",
  name: "Google Ads",
  description:
    "Manage campaigns, ad groups, ads, keywords, budgets, and run performance reports in Google Ads",
  icon: GoogleAdsIcon,
  oauth: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnvVar: "AUTH_GOOGLE_ID",
    clientSecretEnvVar: "AUTH_GOOGLE_SECRET",
    scopes: ["https://www.googleapis.com/auth/adwords"],
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
  createClient(tokens, orgKey) {
    if (!orgKey) {
      throw new Error("Google Ads developer token not configured. An org admin must add it in Settings.");
    }
    return {
      baseUrl: "https://googleads.googleapis.com/v19",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "developer-token": orgKey,
        "Content-Type": "application/json",
      },
    } satisfies GoogleAdsClient;
  },
  tools,
  toolCount: tools.length,
  orgKeyRequired: {
    label: "Developer Token",
    helpText: "Found in Google Ads > Tools & Settings > API Center on your manager (MCC) account.",
  },
};
