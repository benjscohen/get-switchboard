import { google, sheets_v4 } from "googleapis";
import type { IntegrationConfig, IntegrationToolDef } from "../types";
import { SHEETS_TOOLS } from "./tools";

function SheetsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <path
        d="M11.25 0H4.5A1.5 1.5 0 003 1.5v15A1.5 1.5 0 004.5 18h9a1.5 1.5 0 001.5-1.5V4.5L11.25 0z"
        fill="#0F9D58"
      />
      <path d="M11.25 0v4.5H15L11.25 0z" fill="#87CEAC" />
      <path
        d="M5.25 9v5.25h7.5V9H5.25zm3.375 4.5H6v-1.5h2.625v1.5zm0-2.25H6V9.75h2.625v1.5zm3.375 2.25H9.375v-1.5H12v1.5zm0-2.25H9.375V9.75H12v1.5z"
        fill="#F1F1F1"
      />
    </svg>
  );
}

const tools: IntegrationToolDef[] = SHEETS_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  schema: t.schema,
  execute: (args: Record<string, unknown>, client: unknown) =>
    t.execute(args, client as sheets_v4.Sheets),
}));

export const googleSheetsIntegration: IntegrationConfig = {
  id: "google-sheets",
  name: "Google Sheets",
  description: "Read, write, format, and manage Google Sheets spreadsheets",
  icon: SheetsIcon,
  oauth: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnvVar: "AUTH_GOOGLE_ID",
    clientSecretEnvVar: "AUTH_GOOGLE_SECRET",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
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
    return google.sheets({ version: "v4", auth: oauth2 });
  },
  tools,
  toolCount: tools.length,
};
