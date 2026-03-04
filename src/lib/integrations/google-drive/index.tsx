import { google, drive_v3 } from "googleapis";
import type { IntegrationConfig, IntegrationToolDef } from "../types";
import { DRIVE_TOOLS } from "./tools";

function DriveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <path d="M1.35 15.3L6.3 6.6h5.4l-4.95 8.7H1.35z" fill="#4285F4" />
      <path d="M17.1 15.3H6.75l2.7-4.5h7.65L17.1 15.3z" fill="#0F9D58" />
      <path d="M6.3 6.6L9 1.5h5.4L11.7 6.6H6.3z" fill="#FBBC04" />
      <path d="M9 1.5L6.3 6.6l2.7 4.5h5.4l2.7-4.5L14.4 1.5H9z" fill="none" />
      <path d="M9.45 10.8L6.75 15.3l-5.4 0 2.7-4.5h5.4z" fill="#4285F4" opacity="0.1" />
      <path d="M11.7 6.6H6.3L3.6 1.5h5.4L11.7 6.6z" fill="#FBBC04" opacity="0.1" />
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
