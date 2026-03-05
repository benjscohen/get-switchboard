import { auth, calendar, calendar_v3 } from "@googleapis/calendar";
import type { IntegrationConfig, IntegrationToolDef } from "../types";
import { CALENDAR_TOOLS } from "./tools";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <path
        d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"
        fill="#4285F4"
      />
      <path
        d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"
        fill="#34A853"
      />
      <path
        d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"
        fill="#FBBC05"
      />
      <path
        d="M8.98 3.58c1.32 0 2.5.44 3.44 1.35l2.58-2.59C13.46.89 11.14 0 8.98 0A8 8 0 001.83 5.41L4.5 7.48a4.77 4.77 0 014.48-3.9z"
        fill="#EA4335"
      />
    </svg>
  );
}

// Wrap CalendarToolDef[] as IntegrationToolDef[] — the execute signature
// is narrowed inside each tool but the client is passed as `unknown` from
// the generic handler and cast here.
const tools: IntegrationToolDef[] = CALENDAR_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  schema: t.schema,
  execute: (args: Record<string, unknown>, client: unknown) =>
    t.execute(args, client as calendar_v3.Calendar),
}));

export const googleCalendarIntegration: IntegrationConfig = {
  id: "google-calendar",
  name: "Google Calendar",
  description: "Read and manage Google Calendar events, calendars, and sharing",
  icon: GoogleIcon,
  oauth: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnvVar: "AUTH_GOOGLE_ID",
    clientSecretEnvVar: "AUTH_GOOGLE_SECRET",
    scopes: ["https://www.googleapis.com/auth/calendar"],
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
    return calendar({ version: "v3", auth: oauth2 });
  },
  tools,
  toolCount: tools.length,
};
