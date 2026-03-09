import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAppOrigin } from "@/lib/app-url";
import { syncProfileFromAuth } from "@/lib/sync-profile";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = getAppOrigin(request);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/tools";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Sync Google profile data (name, avatar) to our profiles table
      // and activate invited users on first sign-in.
      await syncProfileFromAuth(supabase).catch(() => {
        // Non-fatal — don't block login if sync fails
      });
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth code exchange failed — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
