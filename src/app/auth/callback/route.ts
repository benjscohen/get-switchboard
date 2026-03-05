import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAppOrigin } from "@/lib/app-url";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = getAppOrigin(request);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/mcp";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth code exchange failed — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
