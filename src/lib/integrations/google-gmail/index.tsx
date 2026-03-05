import { google, gmail_v1 } from "googleapis";
import type { IntegrationConfig, IntegrationToolDef } from "../types";
import { GMAIL_TOOLS } from "./tools";

function GmailIcon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/integrations/gmail.svg" alt="" width={18} height={18} className="shrink-0" />
  );
}

const tools: IntegrationToolDef[] = GMAIL_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  schema: t.schema,
  execute: (args: Record<string, unknown>, client: unknown, meta?: { senderName?: string | null }) =>
    t.execute(args, client as gmail_v1.Gmail, meta),
}));

export const googleGmailIntegration: IntegrationConfig = {
  id: "google-gmail",
  name: "Gmail",
  description:
    "Search, read, send, reply, forward, and manage Gmail messages, threads, drafts, labels, filters, and vacation responder",
  icon: GmailIcon,
  oauth: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnvVar: "AUTH_GOOGLE_ID",
    clientSecretEnvVar: "AUTH_GOOGLE_SECRET",
    scopes: ["https://mail.google.com/"],
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
  createClient(tokens) {
    const oauth2 = new google.auth.OAuth2(
      process.env.AUTH_GOOGLE_ID,
      process.env.AUTH_GOOGLE_SECRET
    );
    oauth2.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    return google.gmail({ version: "v1", auth: oauth2 });
  },
  tools,
  toolCount: tools.length,
};
