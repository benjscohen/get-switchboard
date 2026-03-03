import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { IntegrationList } from "@/components/dashboard/integration-list";
import { ConnectCard } from "@/components/dashboard/connect-card";
import { allIntegrations } from "@/lib/integrations/registry";
import { headers } from "next/headers";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const connections = await prisma.connection.findMany({
    where: { userId },
    select: { integrationId: true },
  });

  const connectedIds = new Set(connections.map((c) => c.integrationId));

  const integrations = allIntegrations.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    icon: i.icon(),
    toolCount: i.toolCount,
    tools: i.tools.map((t) => ({ name: t.name, description: t.description })),
    connected: connectedIds.has(i.id),
  }));

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  return (
    <Container className="py-10">
      <h1 className="mb-8 text-2xl font-bold">Dashboard</h1>
      <div className="space-y-6">
        <IntegrationList integrations={integrations} />
        <ConnectCard origin={origin} />
      </div>
    </Container>
  );
}
