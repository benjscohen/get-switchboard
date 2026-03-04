import { google, gmail_v1 } from "googleapis";
import type { IntegrationConfig, IntegrationToolDef } from "../types";
import { GMAIL_TOOLS } from "./tools";

function GmailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <path d="M2.25 15.75h3V9l-4.5-3.375v9A1.125 1.125 0 002.25 15.75z" fill="#4285F4" />
      <path d="M12.75 15.75h3a1.125 1.125 0 001.125-1.125v-9L12.75 9z" fill="#34A853" />
      <path d="M12.75 3.375V9l4.125-3.375L14.625 3.75 12.75 2.25z" fill="#FBBC04" />
      <path d="M5.25 9V3.375L9 6.375l3.75-3 .001 3.375-3.75 3L5.25 9z" fill="#EA4335" />
      <path d="M.75 5.625L5.25 9V3.375L3.375 2.25 2.25 3.375z" fill="#C5221F" />
    </svg>
  );
}

const tools: IntegrationToolDef[] = GMAIL_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  schema: t.schema,
  execute: (args: Record<string, unknown>, client: unknown) =>
    t.execute(args, client as gmail_v1.Gmail),
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
