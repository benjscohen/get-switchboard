import { auth, docs, docs_v1 } from "@googleapis/docs";
import type { IntegrationConfig, IntegrationToolDef } from "../types";
import { DOCS_TOOLS } from "./tools";

function DocsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <path
        d="M11.25 0H4.5A1.5 1.5 0 003 1.5v15A1.5 1.5 0 004.5 18h9a1.5 1.5 0 001.5-1.5V4.5L11.25 0z"
        fill="#4285F4"
      />
      <path d="M11.25 0v4.5H15L11.25 0z" fill="#A1C4FD" />
      <path
        d="M5.25 10.5h7.5v1.125H5.25V10.5zm0 2.25h5.25v1.125H5.25V12.75zm0-4.5h7.5v1.125H5.25V8.25z"
        fill="#F1F1F1"
      />
    </svg>
  );
}

const tools: IntegrationToolDef[] = DOCS_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  schema: t.schema,
  execute: (args: Record<string, unknown>, client: unknown) =>
    t.execute(args, client as docs_v1.Docs),
}));

export const googleDocsIntegration: IntegrationConfig = {
  id: "google-docs",
  name: "Google Docs",
  description:
    "Create, read, edit, and format Google Docs — text, tables, images, headers, named ranges, and document styling",
  icon: DocsIcon,
  oauth: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnvVar: "AUTH_GOOGLE_ID",
    clientSecretEnvVar: "AUTH_GOOGLE_SECRET",
    scopes: ["https://www.googleapis.com/auth/documents"],
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
    return docs({ version: "v1", auth: oauth2 });
  },
  tools,
  toolCount: tools.length,
};
