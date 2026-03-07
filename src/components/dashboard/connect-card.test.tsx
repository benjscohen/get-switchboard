// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectCard } from "./connect-card";

vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a {...props}>{children}</a>,
}));

vi.mock("@/components/ui/code-block", () => ({
  CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  TabPanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/mcp-snippets", () => ({
  MCP_CLIENTS: [{ id: "claude-desktop", label: "Claude Desktop", hint: "hint" }],
  generateSnippet: () => "snippet",
  generatePrompt: () => "prompt",
}));

vi.mock("@/hooks/use-copy-to-clipboard", () => ({
  useCopyToClipboard: () => ({ copied: false, copy: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  revokeApiKey: vi.fn(),
}));

const activeKey = {
  id: "key-1",
  name: "My Key",
  keyPrefix: "sk_live_abc",
  lastUsedAt: null,
  createdAt: new Date().toISOString(),
  revokedAt: null,
  scope: "full",
  expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  permissions: null,
  isAgentKey: false,
};

describe("ConnectCard — agent code removed", () => {
  it("does not show Slack Agent section in Mode 3 expanded", async () => {
    const user = userEvent.setup();

    render(
      <ConnectCard
        origin="http://localhost:3000"
        initialKeys={[activeKey]}
        availableIntegrations={[]}
      />
    );

    // Mode 3 — compact bar
    expect(screen.getByText("MCP client connected")).toBeInTheDocument();

    // Expand manage keys
    await user.click(screen.getByText("Manage keys"));

    // Should NOT contain any agent-related UI
    expect(screen.queryByText("Slack Agent")).not.toBeInTheDocument();
    expect(screen.queryByText("Create Agent Key")).not.toBeInTheDocument();
    expect(screen.queryByText("Replace Agent Key")).not.toBeInTheDocument();
  });

  it("does not accept preferredAgentModel prop (type check coverage)", () => {
    // Verify ConnectCard works without preferredAgentModel
    render(
      <ConnectCard
        origin="http://localhost:3000"
        initialKeys={[activeKey]}
        availableIntegrations={[]}
      />
    );

    expect(screen.getByText("MCP client connected")).toBeInTheDocument();
  });

  it("still shows key list in expanded mode without agent controls", async () => {
    const user = userEvent.setup();

    render(
      <ConnectCard
        origin="http://localhost:3000"
        initialKeys={[activeKey]}
        availableIntegrations={[]}
      />
    );

    await user.click(screen.getByText("Manage keys"));

    // Key list should still render
    expect(screen.getByText("My Key")).toBeInTheDocument();
    expect(screen.getByText(/sk_live_abc/)).toBeInTheDocument();
  });

  it("renders Get Started (Mode 1) when no active keys", () => {
    render(
      <ConnectCard
        origin="http://localhost:3000"
        initialKeys={[]}
        availableIntegrations={[]}
      />
    );

    expect(screen.getByText("Get Started")).toBeInTheDocument();
    // No agent UI in this mode either
    expect(screen.queryByText("Slack Agent")).not.toBeInTheDocument();
  });
});
