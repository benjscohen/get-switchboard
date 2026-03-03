import { NextResponse } from "next/server";
import { put, head, getDownloadUrl } from "@vercel/blob";

export const dynamic = "force-dynamic";

const BLOB_PATH = "waitlist.json";

async function getWaitlist(): Promise<string[]> {
  try {
    const blob = await head(BLOB_PATH);
    const downloadUrl = getDownloadUrl(blob.url);
    const res = await fetch(downloadUrl);
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
      access: "private",
      addRandomSuffix: false,
    });

    return NextResponse.json({ message: "Added to waitlist" });
  } catch (error) {
    console.error("Waitlist error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
