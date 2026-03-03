import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateApiKey, hashApiKey } from "@/lib/crypto";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keys = await prisma.apiKey.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(keys);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const name = body.name?.trim() || "Default";

  const { raw, hash, prefix } = generateApiKey();

  await prisma.apiKey.create({
    data: {
      userId: session.user.id,
      name,
      keyHash: hash,
      keyPrefix: prefix,
    },
  });

  return NextResponse.json({ key: raw, prefix, name });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing key id" }, { status: 400 });
  }

  await prisma.apiKey.deleteMany({
    where: { id, userId: session.user.id },
  });

  return NextResponse.json({ success: true });
}
