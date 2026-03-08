import { describe, it, expect, beforeEach } from "vitest";
import {
  buildThreadKey,
  getRunningSession,
  registerSession,
  unregisterSession,
} from "./session-registry.js";
import type { RunningSession } from "./session-registry.js";

function makeSession(overrides?: Partial<RunningSession>): RunningSession {
  return {
    sessionId: "sess-1",
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

describe("buildThreadKey", () => {
  it("joins channelId and threadTs with colon", () => {
    expect(buildThreadKey("C123", "1234567890.123456")).toBe(
      "C123:1234567890.123456",
    );
  });
});

describe("session registry", () => {
  beforeEach(() => {
    // Clean slate — unregister any leftover keys
    unregisterSession("C1:T1");
    unregisterSession("C2:T2");
  });

  it("returns undefined for unregistered key", () => {
    expect(getRunningSession("C1:T1")).toBeUndefined();
  });

  it("registers and retrieves a session", () => {
    const session = makeSession();
    registerSession("C1:T1", session);
    expect(getRunningSession("C1:T1")).toBe(session);
  });

  it("unregisters a session", () => {
    registerSession("C1:T1", makeSession());
    unregisterSession("C1:T1");
    expect(getRunningSession("C1:T1")).toBeUndefined();
  });

  it("tracks multiple sessions independently", () => {
    const s1 = makeSession({ sessionId: "sess-1" });
    const s2 = makeSession({ sessionId: "sess-2" });
    registerSession("C1:T1", s1);
    registerSession("C2:T2", s2);
    expect(getRunningSession("C1:T1")?.sessionId).toBe("sess-1");
    expect(getRunningSession("C2:T2")?.sessionId).toBe("sess-2");
  });

  it("overwrites if same key registered again", () => {
    const s1 = makeSession({ sessionId: "sess-1" });
    const s2 = makeSession({ sessionId: "sess-2" });
    registerSession("C1:T1", s1);
    registerSession("C1:T1", s2);
    expect(getRunningSession("C1:T1")?.sessionId).toBe("sess-2");
  });
});
