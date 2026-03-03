import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { EndpointCard } from "@/components/dashboard/endpoint-card";
import { ConnectionStatus } from "@/components/dashboard/connection-status";
import { ApiKeyManager } from "@/components/dashboard/api-key-manager";
import { headers } from "next/headers";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const googleAccount = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { id: true },
  });

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  return (
    <Container className="py-10">
      <h1 className="mb-8 text-2xl font-bold">Dashboard</h1>
      <div className="space-y-6">
        <EndpointCard origin={origin} />
        <ConnectionStatus connected={!!googleAccount} />
        <ApiKeyManager />
      </div>
    </Container>
  );
}
