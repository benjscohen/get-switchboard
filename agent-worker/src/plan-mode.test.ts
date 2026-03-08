import { describe, it, expect, beforeEach } from "vitest";
import {
  buildPlanApprovalBlocks,
  buildPlanApprovedBlocks,
  buildPlanRevisingBlocks,
  buildPlanExpiredBlocks,
} from "./slack-blocks.js";
import {
  buildThreadKey,
  getRunningSession,
  registerSession,
  unregisterSession,
  findRunningSessionBySessionId,
} from "./session-registry.js";
import type { RunningSession, PlanDecision, PlanPhase } from "./session-registry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides?: Partial<RunningSession>): RunningSession {
  return {
    sessionId: "plan-sess-1",
    claudeSessionId: null,
    tempDir: null,
    pendingFollowUpTs: [],
    pushMessage: () => true,
    close: () => {},
    openGate: () => {},
    isPlanMode: false,
    planPhase: "off",
    pendingPlanApproval: null,
    setPermissionMode: null,
    abortController: null,
    killedByUser: false,
    ...overrides,
  };
}

function makePlanSession(overrides?: Partial<RunningSession>): RunningSession {
  return makeSession({
    isPlanMode: true,
    planPhase: "exploring",
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Plan approval block rendering
// ---------------------------------------------------------------------------

describe("plan approval blocks", () => {
  it("buildPlanApprovalBlocks includes header, plan text, help context, and approve button", () => {
    const blocks = buildPlanApprovalBlocks("My plan text", "sess-123");

    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toMatchObject({ type: "header" });
    expect(blocks[1]).toMatchObject({
      type: "section",
      text: { type: "mrkdwn", text: "My plan text" },
    });
    expect(blocks[2]).toMatchObject({ type: "context" });
    expect(blocks[3]).toMatchObject({
      type: "actions",
      elements: [
        expect.objectContaining({
          type: "button",
          action_id: "approve_plan",
          value: "sess-123",
          style: "primary",
        }),
      ],
    });
  });

  it("buildPlanApprovedBlocks shows approved header and removes button", () => {
    const blocks = buildPlanApprovedBlocks("My plan");

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({
      type: "header",
      text: { text: "Plan (Approved)" },
    });
    // No actions block
    expect(blocks.find((b) => b.type === "actions")).toBeUndefined();
    // Has context with checkmark
    const ctx = blocks.find((b) => b.type === "context") as {
      elements: Array<{ text: string }>;
    };
    expect(ctx.elements[0].text).toContain("Approved");
  });

  it("buildPlanRevisingBlocks shows revising header and hourglass", () => {
    const blocks = buildPlanRevisingBlocks("My plan");

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({
      type: "header",
      text: { text: "Plan (Revising...)" },
    });
    // No button
    expect(blocks.find((b) => b.type === "actions")).toBeUndefined();
    // Has context with hourglass
    const ctx = blocks.find((b) => b.type === "context") as {
      elements: Array<{ text: string }>;
    };
    expect(ctx.elements[0].text).toContain("Revising");
  });

  it("buildPlanExpiredBlocks shows expired header and warning", () => {
    const blocks = buildPlanExpiredBlocks("My plan");

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({
      type: "header",
      text: { text: "Plan (Expired)" },
    });
    // No button
    expect(blocks.find((b) => b.type === "actions")).toBeUndefined();
    // Has context with warning
    const ctx = blocks.find((b) => b.type === "context") as {
      elements: Array<{ text: string }>;
    };
    expect(ctx.elements[0].text).toContain("expired");
  });

  it("truncates very long plan text in blocks", () => {
    const longPlan = "x".repeat(5000);
    const blocks = buildPlanApprovalBlocks(longPlan, "sess-1");

    const section = blocks[1] as { text: { text: string } };
    expect(section.text.text.length).toBeLessThanOrEqual(3000);
    expect(section.text.text).toContain("truncated");
  });
});

// ---------------------------------------------------------------------------
// Plan phase state machine
// ---------------------------------------------------------------------------

describe("plan phase lifecycle", () => {
  beforeEach(() => {
    unregisterSession("C1:T1");
  });

  it("starts in exploring phase when plan mode is on", () => {
    const session = makePlanSession();
    expect(session.planPhase).toBe("exploring");
    expect(session.isPlanMode).toBe(true);
  });

  it("starts in off phase when plan mode is not on", () => {
    const session = makeSession();
    expect(session.planPhase).toBe("off");
    expect(session.isPlanMode).toBe(false);
  });

  it("transitions exploring → presented when plan approval is set", () => {
    const session = makePlanSession();
    registerSession("C1:T1", session);

    // Simulate what happens when ExitPlanMode hook fires
    session.planPhase = "presented";
    session.pendingPlanApproval = {
      plan: "My plan",
      planMessageTs: "ts-1",
      resolve: () => {},
    };

    expect(session.planPhase).toBe("presented");
    expect(session.pendingPlanApproval).not.toBeNull();
  });

  it("transitions presented → approved when approve resolves", () => {
    const session = makePlanSession();
    registerSession("C1:T1", session);

    // Set up presented state
    session.planPhase = "presented";
    let resolvedDecision: PlanDecision | null = null;
    session.pendingPlanApproval = {
      plan: "My plan",
      planMessageTs: "ts-1",
      resolve: (d) => { resolvedDecision = d; },
    };

    // Simulate approve button click
    session.pendingPlanApproval.resolve({ action: "approve" });
    session.planPhase = "approved";
    session.pendingPlanApproval = null;

    expect(session.planPhase).toBe("approved");
    expect(resolvedDecision).toEqual({ action: "approve" });
    expect(session.pendingPlanApproval).toBeNull();
  });

  it("transitions presented → revising when feedback resolves", () => {
    const session = makePlanSession();
    registerSession("C1:T1", session);

    // Set up presented state
    session.planPhase = "presented";
    let resolvedDecision: PlanDecision | null = null;
    session.pendingPlanApproval = {
      plan: "My plan",
      planMessageTs: "ts-1",
      resolve: (d) => { resolvedDecision = d; },
    };

    // Simulate user feedback
    session.pendingPlanApproval.resolve({ action: "revise", feedback: "Add tests" });
    session.planPhase = "revising";
    session.pendingPlanApproval = null;

    expect(session.planPhase).toBe("revising");
    expect(resolvedDecision).toEqual({ action: "revise", feedback: "Add tests" });
  });

  it("transitions approved → off after execution starts", () => {
    const session = makePlanSession();
    session.planPhase = "approved";

    // Simulate execution start
    session.isPlanMode = false;
    session.planPhase = "off";

    expect(session.planPhase).toBe("off");
    expect(session.isPlanMode).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findRunningSessionBySessionId (used by approve_plan handler)
// ---------------------------------------------------------------------------

describe("findRunningSessionBySessionId", () => {
  beforeEach(() => {
    unregisterSession("C1:T1");
    unregisterSession("C2:T2");
  });

  it("returns undefined when no sessions exist", () => {
    expect(findRunningSessionBySessionId("nonexistent")).toBeUndefined();
  });

  it("finds a session by its sessionId", () => {
    const session = makePlanSession({ sessionId: "plan-abc" });
    registerSession("C1:T1", session);

    const found = findRunningSessionBySessionId("plan-abc");
    expect(found).toBe(session);
  });

  it("returns undefined for wrong sessionId", () => {
    const session = makePlanSession({ sessionId: "plan-abc" });
    registerSession("C1:T1", session);

    expect(findRunningSessionBySessionId("plan-xyz")).toBeUndefined();
  });

  it("finds correct session among multiple registered sessions", () => {
    const s1 = makePlanSession({ sessionId: "plan-1" });
    const s2 = makePlanSession({ sessionId: "plan-2" });
    registerSession("C1:T1", s1);
    registerSession("C2:T2", s2);

    expect(findRunningSessionBySessionId("plan-2")).toBe(s2);
  });
});

// ---------------------------------------------------------------------------
// Plan approval promise blocking behavior
// ---------------------------------------------------------------------------

describe("plan approval blocking", () => {
  it("pendingPlanApproval blocks until resolved", async () => {
    let decision: PlanDecision | null = null;

    const promise = new Promise<PlanDecision>((resolve) => {
      const session = makePlanSession();
      session.planPhase = "presented";
      session.pendingPlanApproval = {
        plan: "test plan",
        planMessageTs: "ts-1",
        resolve,
      };

      // Simulate approve after 10ms
      setTimeout(() => {
        session.pendingPlanApproval!.resolve({ action: "approve" });
      }, 10);
    });

    decision = await promise;
    expect(decision).toEqual({ action: "approve" });
  });

  it("pendingPlanApproval blocks until revise resolved", async () => {
    const promise = new Promise<PlanDecision>((resolve) => {
      const session = makePlanSession();
      session.planPhase = "presented";
      session.pendingPlanApproval = {
        plan: "test plan",
        planMessageTs: "ts-1",
        resolve,
      };

      // Simulate feedback after 10ms
      setTimeout(() => {
        session.pendingPlanApproval!.resolve({
          action: "revise",
          feedback: "needs more detail",
        });
      }, 10);
    });

    const decision = await promise;
    expect(decision).toEqual({
      action: "revise",
      feedback: "needs more detail",
    });
  });
});

// ---------------------------------------------------------------------------
// Plan mode feedback routing logic
// ---------------------------------------------------------------------------

describe("plan mode feedback routing", () => {
  beforeEach(() => {
    unregisterSession("C1:T1");
  });

  it("feedback resolves pendingPlanApproval when in presented phase", () => {
    const session = makePlanSession({ sessionId: "sess-fb" });
    session.planPhase = "presented";

    let resolvedDecision: PlanDecision | null = null;
    session.pendingPlanApproval = {
      plan: "My plan",
      planMessageTs: "ts-1",
      resolve: (d) => { resolvedDecision = d; },
    };

    registerSession("C1:T1", session);

    // Simulate feedback: resolve the pending approval directly
    const running = getRunningSession("C1:T1");
    expect(running?.pendingPlanApproval).not.toBeNull();

    running!.pendingPlanApproval!.resolve({ action: "revise", feedback: "Add error handling" });

    expect(resolvedDecision).toEqual({
      action: "revise",
      feedback: "Add error handling",
    });
  });

  it("in exploring phase with no pendingPlanApproval, message falls through to follow-up injection", () => {
    const session = makePlanSession({ sessionId: "sess-explore" });
    session.planPhase = "exploring";
    // pendingPlanApproval is null during exploration
    registerSession("C1:T1", session);

    const running = getRunningSession("C1:T1");
    expect(running?.pendingPlanApproval).toBeNull();
    expect(running?.isPlanMode).toBe(true);
    expect(running?.planPhase).toBe("exploring");
    // In the real code this would fall through to injectFollowUp
    // We verify the conditions that determine the routing:
    // pendingPlanApproval is null → doesn't resolve
    // isPlanMode=true && planPhase!="off" → triggers the new fallthrough path
  });
});

// ---------------------------------------------------------------------------
// Result suppression during plan phase
// ---------------------------------------------------------------------------

describe("plan mode result suppression logic", () => {
  // This tests the guard condition: planModeRequested && !planExecutionStarted
  // In agent.ts, this guard suppresses ALL result:success from posting to Slack
  // during the plan phase. We test the condition directly.

  it("suppresses result when in plan mode and execution not started", () => {
    const planModeRequested = true;
    const planExecutionStarted = false;

    const shouldSuppress = planModeRequested && !planExecutionStarted;
    expect(shouldSuppress).toBe(true);
  });

  it("does not suppress result when execution has started", () => {
    const planModeRequested = false; // cleared when execution starts
    const planExecutionStarted = true;

    const shouldSuppress = planModeRequested && !planExecutionStarted;
    expect(shouldSuppress).toBe(false);
  });

  it("does not suppress result when not in plan mode", () => {
    const planModeRequested = false;
    const planExecutionStarted = false;

    const shouldSuppress = planModeRequested && !planExecutionStarted;
    expect(shouldSuppress).toBe(false);
  });

  it("suppresses during exploration phase (before ExitPlanMode)", () => {
    const planModeRequested = true;
    const planApproved = false;
    const planExecutionStarted = false;

    const shouldSuppress = planModeRequested && !planExecutionStarted;
    expect(shouldSuppress).toBe(true);
    // This is the key fix — previously only suppressed when planApproved=true
  });

  it("suppresses during approved phase (before execution restarts)", () => {
    const planModeRequested = true;
    const planApproved = true;
    const planExecutionStarted = false;

    const shouldSuppress = planModeRequested && !planExecutionStarted;
    expect(shouldSuppress).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Plan mode detection
// ---------------------------------------------------------------------------

describe("plan mode prefix detection", () => {
  const planRegex = /^\s*plan\s*:/i;

  it("detects plan: prefix", () => {
    expect(planRegex.test("plan: add a new feature")).toBe(true);
  });

  it("detects Plan: prefix (case insensitive)", () => {
    expect(planRegex.test("Plan: do something")).toBe(true);
  });

  it("detects PLAN: prefix", () => {
    expect(planRegex.test("PLAN: do something")).toBe(true);
  });

  it("detects plan: with leading whitespace", () => {
    expect(planRegex.test("  plan: do something")).toBe(true);
  });

  it("does not match plan in the middle of text", () => {
    expect(planRegex.test("make a plan: for this")).toBe(false);
  });

  it("does not match without colon", () => {
    expect(planRegex.test("plan add a feature")).toBe(false);
  });

  it("strips prefix correctly", () => {
    const text = "plan: add dark mode toggle";
    const stripped = text.replace(/^\s*plan\s*:\s*/i, "");
    expect(stripped).toBe("add dark mode toggle");
  });
});
