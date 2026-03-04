import { google, slides_v1 } from "googleapis";
import type { IntegrationConfig, IntegrationToolDef } from "../types";
import { SLIDES_TOOLS } from "./tools";

function SlidesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <path
        d="M11.25 0H4.5A1.5 1.5 0 003 1.5v15A1.5 1.5 0 004.5 18h9a1.5 1.5 0 001.5-1.5V4.5L11.25 0z"
        fill="#F4B400"
      />
      <path d="M11.25 0v4.5H15L11.25 0z" fill="#F7D97A" />
      <rect x="5.25" y="8.25" width="7.5" height="5.25" rx="0.375" fill="#F1F1F1" />
    </svg>
  );
}

const tools: IntegrationToolDef[] = SLIDES_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  schema: t.schema,
  execute: (args: Record<string, unknown>, client: unknown) =>
    t.execute(args, client as slides_v1.Slides),
}));

export const googleSlidesIntegration: IntegrationConfig = {
  id: "google-slides",
  name: "Google Slides",
  description:
    "Create, read, edit, and format Google Slides presentations — slides, shapes, text, images, tables, and visual thumbnails",
  icon: SlidesIcon,
  oauth: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnvVar: "AUTH_GOOGLE_ID",
    clientSecretEnvVar: "AUTH_GOOGLE_SECRET",
    scopes: ["https://www.googleapis.com/auth/presentations"],
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
    return google.slides({ version: "v1", auth: oauth2 });
  },
  tools,
  toolCount: tools.length,
};
