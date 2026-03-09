// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentTokenCard } from "./agent-token-card";

vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a {...props}>{children}</a>,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const sampleIntegrations = [
  {
    id: "google-calendar",
    name: "Google Calendar",
    tools: [
      { name: "gc_list_events", description: "List events" },
      { name: "gc_create_event", description: "Create event" },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    tools: [{ name: "slack_send_message", description: "Send message" }],
  },
];

const activeAgentKey = {
  id: "key-1",
  keyPrefix: "sk_live_abc",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  permissions: null as Record<string, string[] | null> | null,
};

beforeEach(() => {
  mockFetch.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("AgentTokenCard — State A (not enabled)", () => {
  it("renders the not-enabled state with title and description", () => {
    render(
      <AgentTokenCard
        initialAgentKey={null}
        preferredAgentModel="claude-sonnet-4-6"
        availableIntegrations={sampleIntegrations}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    expect(screen.getByText("Slack Agent")).toBeInTheDocument();
    expect(
      screen.getByText(/DM the Switchboard Agent bot/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enable Slack Agent" })
    ).toBeInTheDocument();
  });

  it("renders model dropdown with correct default", () => {
    render(
      <AgentTokenCard
        initialAgentKey={null}
        preferredAgentModel="claude-opus-4-6"
        availableIntegrations={[]}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("claude-opus-4-6");
  });

  it("shows permissions expander when integrations are available", async () => {
    const user = userEvent.setup();
    render(
      <AgentTokenCard
        initialAgentKey={null}
        preferredAgentModel="claude-sonnet-4-6"
        availableIntegrations={sampleIntegrations}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    const expander = screen.getByText("Restrict to specific integrations or tools");
    expect(expander).toBeInTheDocument();

    await user.click(expander);

    expect(screen.getByText("All integrations")).toBeInTheDocument();
    expect(screen.getByText("Specific integrations")).toBeInTheDocument();
  });

  it("hides permissions expander when no integrations", () => {
    render(
      <AgentTokenCard
        initialAgentKey={null}
        preferredAgentModel="claude-sonnet-4-6"
        availableIntegrations={[]}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    expect(
      screen.queryByText("Restrict to specific integrations or tools")
    ).not.toBeInTheDocument();
  });

  it("calls POST /api/keys/agent on enable", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "new-key",
        prefix: "sk_live_new",
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    render(
      <AgentTokenCard
        initialAgentKey={null}
        preferredAgentModel="claude-sonnet-4-6"
        availableIntegrations={sampleIntegrations}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    await user.click(screen.getByRole("button", { name: "Enable Slack Agent" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/keys/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions: null,
          model: "claude-sonnet-4-6",
        }),
      });
    });
  });

  it("transitions to enabled state after successful enable", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "new-key",
        prefix: "sk_live_new",
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    render(
      <AgentTokenCard
        initialAgentKey={null}
        preferredAgentModel="claude-sonnet-4-6"
        availableIntegrations={sampleIntegrations}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    await user.click(screen.getByRole("button", { name: "Enable Slack Agent" }));

    await waitFor(() => {
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });
    // Should show model label in compact bar
    expect(screen.getByText("Sonnet 4.6")).toBeInTheDocument();
  });

  it("does not display raw key anywhere after enable", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "new-key",
        prefix: "sk_live_new",
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    render(
      <AgentTokenCard
        initialAgentKey={null}
        preferredAgentModel="claude-sonnet-4-6"
        availableIntegrations={[]}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    await user.click(screen.getByRole("button", { name: "Enable Slack Agent" }));

    await waitFor(() => {
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    expect(screen.queryByText("sk_live_testkey")).not.toBeInTheDocument();
    expect(screen.queryByText(/Copy/)).not.toBeInTheDocument();
  });

  it("updates model via PATCH /api/agent/settings on change", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    render(
      <AgentTokenCard
        initialAgentKey={null}
        preferredAgentModel="claude-sonnet-4-6"
        availableIntegrations={[]}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    await user.selectOptions(screen.getByRole("combobox"), "claude-opus-4-6");

    expect(mockFetch).toHaveBeenCalledWith("/api/agent/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-opus-4-6" }),
    });
  });
});

describe("AgentTokenCard — State B (enabled)", () => {
  it("renders compact enabled bar with model name", () => {
    render(
      <AgentTokenCard
        initialAgentKey={activeAgentKey}
        preferredAgentModel="claude-sonnet-4-6"
        availableIntegrations={sampleIntegrations}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    expect(screen.getByText("Slack Agent")).toBeInTheDocument();
    expect(screen.getByText("Sonnet 4.6")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    // Settings panel should be collapsed by default
    expect(screen.queryByText("Disable Slack Agent")).not.toBeInTheDocument();
  });

  it("expands settings panel on click", async () => {
    const user = userEvent.setup();
    render(
      <AgentTokenCard
        initialAgentKey={activeAgentKey}
        preferredAgentModel="claude-sonnet-4-6"
        availableIntegrations={sampleIntegrations}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    await user.click(screen.getByText("Settings"));

    expect(screen.getByText("Disable Slack Agent")).toBeInTheDocument();
    expect(screen.getByText("Full access")).toBeInTheDocument();
    expect(screen.getByText("Edit permissions")).toBeInTheDocument();
  });

  it("shows correct permissions summary for restricted key", async () => {
    const user = userEvent.setup();
    const restrictedKey = {
      ...activeAgentKey,
      permissions: { "google-calendar": null, slack: ["slack_send_message"] },
    };

    render(
      <AgentTokenCard
        initialAgentKey={restrictedKey}
        preferredAgentModel="claude-sonnet-4-6"
        availableIntegrations={sampleIntegrations}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    await user.click(screen.getByText("Settings"));
    expect(screen.getByText("2 integrations")).toBeInTheDocument();
  });

  it("shows '1 integration' for single-integration permission", async () => {
    const user = userEvent.setup();
    const restrictedKey = {
      ...activeAgentKey,
      permissions: { slack: null },
    };

    render(
      <AgentTokenCard
        initialAgentKey={restrictedKey}
        preferredAgentModel="claude-sonnet-4-6"
        availableIntegrations={sampleIntegrations}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    await user.click(screen.getByText("Settings"));
    expect(screen.getByText("1 integration")).toBeInTheDocument();
  });

  it("calls DELETE on disable and transitions back to State A", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    render(
      <AgentTokenCard
        initialAgentKey={activeAgentKey}
        preferredAgentModel="claude-sonnet-4-6"
        availableIntegrations={sampleIntegrations}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    await user.click(screen.getByText("Settings"));
    await user.click(screen.getByText("Disable Slack Agent"));

    expect(mockFetch).toHaveBeenCalledWith("/api/keys/agent", {
      method: "DELETE",
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Enable Slack Agent" })
      ).toBeInTheDocument();
    });
  });

  it("does not disable if user cancels confirm", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <AgentTokenCard
        initialAgentKey={activeAgentKey}
        preferredAgentModel="claude-sonnet-4-6"
        availableIntegrations={sampleIntegrations}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    await user.click(screen.getByText("Settings"));
    await user.click(screen.getByText("Disable Slack Agent"));

    expect(mockFetch).not.toHaveBeenCalled();
    // Should still be in enabled state
    expect(screen.getByText("Disable Slack Agent")).toBeInTheDocument();
  });

  it("opens edit permissions panel and saves via PATCH", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    render(
      <AgentTokenCard
        initialAgentKey={activeAgentKey}
        preferredAgentModel="claude-sonnet-4-6"
        availableIntegrations={sampleIntegrations}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    await user.click(screen.getByText("Settings"));
    await user.click(screen.getByText("Edit permissions"));

    // Should show radio buttons for all/specific
    expect(screen.getAllByText("All integrations").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    // Save with default (all integrations)
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/keys/agent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: null }),
      });
    });
  });

  it("cancels edit permissions without saving", async () => {
    const user = userEvent.setup();

    render(
      <AgentTokenCard
        initialAgentKey={activeAgentKey}
        preferredAgentModel="claude-sonnet-4-6"
        availableIntegrations={sampleIntegrations}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    await user.click(screen.getByText("Settings"));
    await user.click(screen.getByText("Edit permissions"));

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Should return to non-editing state
    expect(screen.getByText("Edit permissions")).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("pre-populates edit with existing permissions for restricted key", async () => {
    const user = userEvent.setup();
    const restrictedKey = {
      ...activeAgentKey,
      permissions: { slack: ["slack_send_message"] },
    };

    render(
      <AgentTokenCard
        initialAgentKey={restrictedKey}
        preferredAgentModel="claude-sonnet-4-6"
        availableIntegrations={sampleIntegrations}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    await user.click(screen.getByText("Settings"));
    await user.click(screen.getByText("Edit permissions"));

    // Should have "Specific integrations" selected since key has permissions
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    const specificRadio = radios.find(
      (r) => r.labels?.[0]?.textContent?.includes("Specific")
    );
    expect(specificRadio?.checked).toBe(true);
  });

  it("collapses settings on second click", async () => {
    const user = userEvent.setup();

    render(
      <AgentTokenCard
        initialAgentKey={activeAgentKey}
        preferredAgentModel="claude-sonnet-4-6"
        availableIntegrations={sampleIntegrations}
        initialShowThinking={true}
        initialChromeMcpEnabled={true}
      />
    );

    await user.click(screen.getByText("Settings"));
    expect(screen.getByText("Disable Slack Agent")).toBeInTheDocument();

    await user.click(screen.getByText("Settings"));
    expect(screen.queryByText("Disable Slack Agent")).not.toBeInTheDocument();
  });
});
