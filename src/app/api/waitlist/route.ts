import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email required" },
        { status: 400 }
      );
    }

    const normalized = email.toLowerCase().trim();

    const existing = await prisma.waitlistEntry.findUnique({
      where: { email: normalized },
    });

    if (existing) {
      return NextResponse.json({ message: "Already on waitlist" });
    }

    await prisma.waitlistEntry.create({
      data: { email: normalized },
    });

    return NextResponse.json({ message: "Added to waitlist" });
  } catch (error) {
    console.error("Waitlist error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
