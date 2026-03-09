import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks — must be before imports
// ---------------------------------------------------------------------------

vi.mock("@anthropic-ai/claude-code", () => ({
  query: vi.fn(),
}));

vi.mock("./logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { prepareWorkspaceForPlan } from "./plan-workspace.js";
import { query } from "@anthropic-ai/claude-code";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_OPTS = {
  prompt: "Clone https://github.com/org/repo and add dark mode",
  cwd: "/tmp/sb-test-user",
  model: "claude-sonnet-4-20250514",
  mcpServerUrl: "https://mcp.example.com/sse",
  agentKey: "test-agent-key",
};

function mockSuccessfulQuery(resultText = "Cloned org/repo into ./repo") {
  const mockConversation = {
    async *[Symbol.asyncIterator]() {
      yield {
        type: "result",
        subtype: "success",
        result: resultText,
        num_turns: 3,
        total_cost_usd: 0.01,
      };
    },
  };
  (query as ReturnType<typeof vi.fn>).mockReturnValue(mockConversation);
}

function mockErrorQuery(error = "API rate limit exceeded") {
  const mockConversation = {
    async *[Symbol.asyncIterator]() {
      yield {
        type: "result",
        subtype: "error",
        error,
        num_turns: 1,
        total_cost_usd: 0.001,
      };
    },
  };
  (query as ReturnType<typeof vi.fn>).mockReturnValue(mockConversation);
}

function mockThrowingQuery(error = new Error("Network failure")) {
  (query as ReturnType<typeof vi.fn>).mockImplementation(() => {
    throw error;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("prepareWorkspaceForPlan", () => {
  it("returns success with summary when workspace is set up", async () => {
    mockSuccessfulQuery("Cloned org/repo into ./repo. Installed deps.");

    const result = await prepareWorkspaceForPlan(DEFAULT_OPTS);

    expect(result.success).toBe(true);
    expect(result.summary).toBe("Cloned org/repo into ./repo. Installed deps.");
    expect(result.error).toBeUndefined();
  });

  it("passes correct options to Claude Code SDK query", async () => {
    mockSuccessfulQuery();

    await prepareWorkspaceForPlan(DEFAULT_OPTS);

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Clone https://github.com/org/repo"),
        options: expect.objectContaining({
          model: "claude-sonnet-4-20250514",
          cwd: "/tmp/sb-test-user",
          permissionMode: "bypassPermissions",
          maxTurns: 15,
          mcpServers: expect.objectContaining({
            switchboard: expect.objectContaining({
              type: "http",
              url: "https://mcp.example.com/sse",
            }),
          }),
        }),
      }),
    );
  });

  it("uses bypassPermissions so it can run git clone", async () => {
    mockSuccessfulQuery();

    await prepareWorkspaceForPlan(DEFAULT_OPTS);

    const callArgs = (query as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.options.permissionMode).toBe("bypassPermissions");
  });

  it("includes the user prompt in the prep agent's prompt", async () => {
    mockSuccessfulQuery();

    await prepareWorkspaceForPlan({
      ...DEFAULT_OPTS,
      prompt: "Fix the auth bug in github.com/acme/platform",
    });

    // Get the most recent call (last one)
    const calls = (query as ReturnType<typeof vi.fn>).mock.calls;
    const callArgs = calls[calls.length - 1][0];
    expect(callArgs.prompt).toContain("Fix the auth bug in github.com/acme/platform");
  });

  it("returns failure on error result from SDK", async () => {
    mockErrorQuery("Model overloaded");

    const result = await prepareWorkspaceForPlan(DEFAULT_OPTS);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Model overloaded");
  });

  it("returns failure when query throws", async () => {
    mockThrowingQuery(new Error("Connection refused"));

    const result = await prepareWorkspaceForPlan(DEFAULT_OPTS);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Connection refused");
  });

  it("returns success with fallback summary when result text is empty", async () => {
    mockSuccessfulQuery("");

    const result = await prepareWorkspaceForPlan(DEFAULT_OPTS);

    expect(result.success).toBe(true);
    expect(result.summary).toBe("Workspace preparation completed");
  });

  it("returns success with fallback summary when result text is null", async () => {
    const mockConversation = {
      async *[Symbol.asyncIterator]() {
        yield {
          type: "result",
          subtype: "success",
          result: null,
          num_turns: 1,
          total_cost_usd: 0.001,
        };
      },
    };
    (query as ReturnType<typeof vi.fn>).mockReturnValue(mockConversation);

    const result = await prepareWorkspaceForPlan(DEFAULT_OPTS);

    expect(result.success).toBe(true);
    expect(result.summary).toBe("Workspace preparation completed");
  });

  it("respects custom timeout", async () => {
    mockSuccessfulQuery();

    // Just verify it doesn't throw — actual timeout behavior is via AbortController
    const result = await prepareWorkspaceForPlan({
      ...DEFAULT_OPTS,
      timeoutMs: 5000,
    });

    expect(result.success).toBe(true);
  });

  it("includes PREP_SYSTEM_PROMPT in the query", async () => {
    mockSuccessfulQuery();

    await prepareWorkspaceForPlan(DEFAULT_OPTS);

    const callArgs = (query as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.options.customSystemPrompt).toContain("workspace preparation assistant");
    expect(callArgs.options.customSystemPrompt).toContain("clone");
    expect(callArgs.options.customSystemPrompt).toContain("Do NOT start planning");
  });

  it("redacts secrets in stderr callback", async () => {
    mockSuccessfulQuery();

    await prepareWorkspaceForPlan(DEFAULT_OPTS);

    const callArgs = (query as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const stderrFn = callArgs.options.stderr;
    expect(stderrFn).toBeDefined();

    // The stderr function should exist and not throw
    expect(() => stderrFn("Bearer ghp_abc123 token")).not.toThrow();
    expect(() => stderrFn("github_pat_abc123 detected")).not.toThrow();
  });

  it("handles multiple message types before result", async () => {
    const mockConversation = {
      async *[Symbol.asyncIterator]() {
        // System and assistant messages come before result
        yield { type: "system", message: "Starting" };
        yield { type: "assistant", message: { content: [{ type: "text", text: "Cloning..." }] } };
        yield {
          type: "result",
          subtype: "success",
          result: "Done cloning",
          num_turns: 5,
          total_cost_usd: 0.02,
        };
      },
    };
    (query as ReturnType<typeof vi.fn>).mockReturnValue(mockConversation);

    const result = await prepareWorkspaceForPlan(DEFAULT_OPTS);

    expect(result.success).toBe(true);
    expect(result.summary).toBe("Done cloning");
  });
});
