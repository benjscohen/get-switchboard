import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Rate limit: 3 req/min per IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit(`waitlist:${ip}`, 3, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Valid email required" },
        { status: 400 }
      );
    }

    const normalized = email.toLowerCase().trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return NextResponse.json(
        { error: "Valid email required" },
        { status: 400 }
      );
    }

    const { data: existing } = await supabaseAdmin
      .from("waitlist_entries")
      .select("id")
      .eq("email", normalized)
      .single();

    if (existing) {
      return NextResponse.json({ message: "Already on waitlist" });
    }

    await supabaseAdmin
      .from("waitlist_entries")
      .insert({ email: normalized });

    return NextResponse.json({ message: "Added to waitlist" });
  } catch (error) {
    logger.error({ err: error }, "Waitlist error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
