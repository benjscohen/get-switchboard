import { google, calendar_v3 } from "googleapis";
import { prisma } from "@/lib/prisma";

export async function getCalendarClient(
  userId: string
): Promise<calendar_v3.Calendar> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account?.refresh_token) {
    throw new Error("No Google account connected");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: account.refresh_token,
    access_token: account.access_token ?? undefined,
  });

  // Auto-persist refreshed tokens
  oauth2Client.on("tokens", async (tokens) => {
    const data: Record<string, unknown> = {};
    if (tokens.access_token) data.access_token = tokens.access_token;
    if (tokens.refresh_token) data.refresh_token = tokens.refresh_token;
    if (tokens.expiry_date)
      data.expires_at = Math.floor(tokens.expiry_date / 1000);

    if (Object.keys(data).length > 0) {
      await prisma.account.update({
        where: { id: account.id },
        data,
      });
    }
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}
