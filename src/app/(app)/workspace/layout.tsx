import { Container } from "@/components/ui/container";
import { SubNav } from "@/components/app/sub-nav";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Container className="py-8">
      <div className="mb-8 flex items-center gap-6">
        <h1 className="text-2xl font-bold">Workspace</h1>
        <SubNav
          tabs={[
            { href: "/workspace/files", label: "Files" },
            { href: "/workspace/vault", label: "Vault" },
            { href: "/workspace/skills", label: "Skills" },
          ]}
        />
      </div>
      {children}
    </Container>
  );
}
