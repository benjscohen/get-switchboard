import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { integrationId } = body as { integrationId?: string };

  if (!integrationId) {
    return NextResponse.json(
      { error: "Missing integrationId" },
      { status: 400 }
    );
  }

  await prisma.connection.deleteMany({
    where: {
      userId: session.user.id,
      integrationId,
    },
  });

  return NextResponse.json({ success: true });
}
