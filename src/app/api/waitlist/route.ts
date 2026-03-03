import { NextResponse } from "next/server";
import { put, head } from "@vercel/blob";

export const dynamic = "force-dynamic";

const BLOB_PATH = "waitlist.json";

async function getWaitlist(): Promise<string[]> {
  try {
    const blob = await head(BLOB_PATH);
    const res = await fetch(blob.url);
    return res.json();
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email required" },
        { status: 400 }
      );
    }

    const waitlist = await getWaitlist();

    if (waitlist.includes(email.toLowerCase())) {
      return NextResponse.json({ message: "Already on waitlist" });
    }

    waitlist.push(email.toLowerCase());

    await put(BLOB_PATH, JSON.stringify(waitlist, null, 2), {
      access: "public",
      addRandomSuffix: false,
    });

    return NextResponse.json({ message: "Added to waitlist" });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
