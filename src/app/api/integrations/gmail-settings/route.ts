import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { google } from "googleapis";
import { decrypt } from "@/lib/encryption";
import { getValidTokens } from "@/lib/integrations/token-refresh";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const supabase = await createClient();
  const { data: connection } = await supabase
    .from("connections")
    .select("id, access_token, refresh_token, expires_at, sender_name")
    .eq("user_id", auth.userId)
    .eq("integration_id", "google-gmail")
    .single();

  if (!connection) {
    return NextResponse.json(
      { error: "Gmail not connected" },
      { status: 404 }
    );
  }

  // Get email and signature from Gmail API
  try {
    const tokens = await getValidTokens({
      id: connection.id,
      integrationId: "google-gmail",
      accessToken: decrypt(connection.access_token),
      refreshToken: connection.refresh_token
        ? decrypt(connection.refresh_token)
        : null,
      expiresAt: connection.expires_at
        ? new Date(connection.expires_at)
        : null,
    });

    const oauth2 = new google.auth.OAuth2(
      process.env.AUTH_GOOGLE_ID,
      process.env.AUTH_GOOGLE_SECRET
    );
    oauth2.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    const gmail = google.gmail({ version: "v1", auth: oauth2 });

    const res = await gmail.users.settings.sendAs.list({ userId: "me" });
    const primary = (res.data.sendAs ?? []).find((s) => s.isPrimary);

    const signatureHtml = primary?.signature || "";
    // Strip HTML for preview
    const signaturePreview = signatureHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return NextResponse.json({
      senderName: connection.sender_name,
      email: primary?.sendAsEmail ?? "",
      signaturePreview: signaturePreview || null,
    });
  } catch {
    return NextResponse.json({
      senderName: connection.sender_name,
      email: null,
      signaturePreview: null,
    });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const body = await req.json();
  const senderName =
    typeof body.senderName === "string" ? body.senderName.trim() : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("connections")
    .update({ sender_name: senderName || null })
    .eq("user_id", auth.userId)
    .eq("integration_id", "google-gmail");

  if (error) {
    return NextResponse.json(
      { error: "Failed to update sender name" },
      { status: 500 }
    );
  }

  return NextResponse.json({ senderName: senderName || null });
}
