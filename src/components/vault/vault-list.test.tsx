// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { VaultList } from "./vault-list";
import type { VaultSecret } from "@/app/(app)/vault/page";

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

const baseSecret: VaultSecret = {
  id: "s1",
  name: "My API Key",
  description: null,
  category: "api_key",
  tags: [],
  fieldNames: [{ name: "key", sensitive: true }],
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  ownership: "owned",
};

const noop = () => {};

describe("VaultList — share summary badges", () => {
  it("shows Shared badge with summary for owned secret with shares", () => {
    const secret: VaultSecret = {
      ...baseSecret,
      shareSummary: { users: 2, teams: 0, organizations: 1 },
    };

    render(<VaultList secrets={[secret]} onEdit={noop} onDelete={noop} onShare={noop} />);

    expect(screen.getByText("(org, 2 users)")).toBeInTheDocument();
  });

  it("does not show share badge for owned secret without shares", () => {
    render(<VaultList secrets={[baseSecret]} onEdit={noop} onDelete={noop} onShare={noop} />);

    expect(screen.queryByText(/org|users|teams/)).not.toBeInTheDocument();
  });

  it("formats single team correctly", () => {
    const secret: VaultSecret = {
      ...baseSecret,
      shareSummary: { users: 0, teams: 1, organizations: 0 },
    };

    render(<VaultList secrets={[secret]} onEdit={noop} onDelete={noop} onShare={noop} />);

    expect(screen.getByText("(1 team)")).toBeInTheDocument();
  });

  it("formats multiple teams and users", () => {
    const secret: VaultSecret = {
      ...baseSecret,
      shareSummary: { users: 3, teams: 2, organizations: 0 },
    };

    render(<VaultList secrets={[secret]} onEdit={noop} onDelete={noop} onShare={noop} />);

    expect(screen.getByText("(2 teams, 3 users)")).toBeInTheDocument();
  });

  it("does not show share summary badge for shared secrets (shared WITH user)", () => {
    const secret: VaultSecret = {
      ...baseSecret,
      id: "s2",
      ownership: "shared",
      sharedBy: "Alice",
      shareSummary: undefined,
    };

    render(<VaultList secrets={[secret]} onEdit={noop} onDelete={noop} onShare={noop} />);

    // Should show the existing "Shared" badge but NOT a summary
    const badges = screen.getAllByTestId("badge");
    const sharedBadges = badges.filter((b) => b.textContent === "Shared");
    expect(sharedBadges).toHaveLength(1);
    expect(screen.queryByText(/\(.*users.*\)/)).not.toBeInTheDocument();
  });
});
