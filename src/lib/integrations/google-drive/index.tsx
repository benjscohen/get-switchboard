import { auth, drive, drive_v3 } from "@googleapis/drive";
import type { IntegrationConfig, IntegrationToolDef } from "../types";
import { DRIVE_TOOLS } from "./tools";

function DriveIcon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/integrations/google-drive.svg" alt="" width={18} height={18} className="shrink-0" />
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
    const oauth2 = new auth.OAuth2(
      process.env.AUTH_GOOGLE_ID,
      process.env.AUTH_GOOGLE_SECRET
    );
    oauth2.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    return drive({ version: "v3", auth: oauth2 });
  },
  tools,
  toolCount: tools.length,
};
