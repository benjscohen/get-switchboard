import { google, drive_v3 } from "googleapis";
import type { IntegrationConfig, IntegrationToolDef } from "../types";
import { DRIVE_TOOLS } from "./tools";

function DriveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 87.3 78" className="shrink-0">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00AC47" />
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 9.85z" fill="#EA4335" />
      <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832D" />
      <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h36.85c1.6 0 3.15-.45 4.5-1.2z" fill="#2684FC" />
      <path d="M73.4 26.5 60.65 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.6 25l16.15 28h27.5c0-1.55-.4-3.1-1.2-4.5z" fill="#FFBA00" />
    </svg>
  );
}

const tools: IntegrationToolDef[] = DRIVE_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  schema: t.schema,
  execute: (args: Record<string, unknown>, client: unknown) =>
    t.execute(args, client as drive_v3.Drive),
}));

export const googleDriveIntegration: IntegrationConfig = {
  id: "google-drive",
  name: "Google Drive",
  description:
    "Search, manage, and share files in Google Drive — permissions, comments, revisions, shared drives, and file operations",
  icon: DriveIcon,
  oauth: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnvVar: "AUTH_GOOGLE_ID",
    clientSecretEnvVar: "AUTH_GOOGLE_SECRET",
    scopes: ["https://www.googleapis.com/auth/drive"],
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
    return google.drive({ version: "v3", auth: oauth2 });
  },
  tools,
  toolCount: tools.length,
};
