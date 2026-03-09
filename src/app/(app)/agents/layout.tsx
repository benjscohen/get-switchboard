import { Container } from "@/components/ui/container";
import { SubNav } from "@/components/app/sub-nav";

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Container className="py-8">
      <div className="mb-8 flex items-center gap-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <SubNav
          tabs={[
            { href: "/agents", label: "Agents" },
            { href: "/agents/schedules", label: "Schedules" },
          ]}
        />
      </div>
      {children}
    </Container>
  );
}
