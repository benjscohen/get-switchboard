import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Regression tests: cumulative turns/token counts across thread follow-ups
//
// Previously, resumeSession() initialized totalTurns, totalInputTokens, and
// totalOutputTokens to 0, losing history on each follow-up. The fix:
//   1. Added total_turns, input_tokens, output_tokens to SessionDbRow & queries
//   2. Seeds counters from session row instead of 0 in resumeSession()
//
// These tests read the actual source files to guard against reversion.
// ---------------------------------------------------------------------------

const DB_SRC = fs.readFileSync(
  path.resolve(__dirname, "db.ts"),
  "utf-8",
);
const AGENT_SRC = fs.readFileSync(
  path.resolve(__dirname, "agent.ts"),
  "utf-8",
);

const COUNTER_COLUMNS = ["total_turns", "input_tokens", "output_tokens"];

// ---------------------------------------------------------------------------
// 1. SessionDbRow must include counter fields
// ---------------------------------------------------------------------------
describe("SessionDbRow interface includes counter fields", () => {
  for (const col of COUNTER_COLUMNS) {
    it(`declares ${col}`, () => {
      const pattern = new RegExp(
        `interface SessionDbRow[\\s\\S]*?${col}\\s*:\\s*number\\s*\\|\\s*null`,
      );
      expect(DB_SRC).toMatch(pattern);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. SESSION_SELECT_COLUMNS constant must include counter columns
// ---------------------------------------------------------------------------
describe("SESSION_SELECT_COLUMNS includes counter columns", () => {
  // Extract the constant value: SESSION_SELECT_COLUMNS = "...";
  const constMatch = DB_SRC.match(
    /SESSION_SELECT_COLUMNS\s*=\s*\n?\s*"([^"]+)"/,
  );
  const selectString = constMatch?.[1] ?? "";

  it("defines SESSION_SELECT_COLUMNS constant", () => {
    expect(constMatch).not.toBeNull();
  });

  for (const col of COUNTER_COLUMNS) {
    it(`includes ${col}`, () => {
      expect(selectString).toContain(col);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. getSessionById and findDoneSessionByThread use the shared constant
// ---------------------------------------------------------------------------
describe("session query functions use SESSION_SELECT_COLUMNS", () => {
  it("getSessionById uses SESSION_SELECT_COLUMNS", () => {
    const fnMatch = DB_SRC.match(
      /async function getSessionById[\s\S]*?\.select\((\w+)\)/,
    );
    expect(fnMatch).not.toBeNull();
    expect(fnMatch?.[1]).toBe("SESSION_SELECT_COLUMNS");
  });

  it("findDoneSessionByThread uses SESSION_SELECT_COLUMNS", () => {
    const fnMatch = DB_SRC.match(
      /async function findDoneSessionByThread[\s\S]*?\.select\((\w+)\)/,
    );
    expect(fnMatch).not.toBeNull();
    expect(fnMatch?.[1]).toBe("SESSION_SELECT_COLUMNS");
  });
});

// ---------------------------------------------------------------------------
// 4. resumeSession seeds counters from session, not from 0
// ---------------------------------------------------------------------------
describe("resumeSession seeds counters from session row", () => {
  const fnStart = AGENT_SRC.indexOf("export async function resumeSession(");
  const fnBody = fnStart >= 0 ? AGENT_SRC.slice(fnStart, fnStart + 6000) : "";

  it("initializes totalTurns from session.total_turns", () => {
    expect(fnBody).toContain("session.total_turns");
    expect(fnBody).not.toMatch(/let\s+totalTurns\s*=\s*0/);
  });

  it("initializes totalInputTokens from session.input_tokens", () => {
    expect(fnBody).toContain("session.input_tokens");
    expect(fnBody).not.toMatch(/let\s+totalInputTokens\s*=\s*0/);
  });

  it("initializes totalOutputTokens from session.output_tokens", () => {
    expect(fnBody).toContain("session.output_tokens");
    expect(fnBody).not.toMatch(/let\s+totalOutputTokens\s*=\s*0/);
  });
});
