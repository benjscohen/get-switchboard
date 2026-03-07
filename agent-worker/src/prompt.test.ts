import { describe, it, expect } from "vitest";
import { extractClaudeMd, buildSystemPrompt } from "./prompt.js";
import type { SwitchboardFile } from "./files.js";

// ---------------------------------------------------------------------------
// extractClaudeMd
// ---------------------------------------------------------------------------

describe("extractClaudeMd", () => {
  it("returns content of /CLAUDE.md", () => {
    const files: SwitchboardFile[] = [
      { path: "/memories/MEMORY.md", content: "memory stuff", isFolder: false },
      { path: "/CLAUDE.md", content: "Always be concise.", isFolder: false },
      { path: "/notes.txt", content: "note", isFolder: false },
    ];
    expect(extractClaudeMd(files)).toBe("Always be concise.");
  });

  it("returns null when /CLAUDE.md is missing", () => {
    const files: SwitchboardFile[] = [
      { path: "/notes.txt", content: "note", isFolder: false },
    ];
    expect(extractClaudeMd(files)).toBeNull();
  });

  it("returns null when /CLAUDE.md has null content", () => {
    const files: SwitchboardFile[] = [
      { path: "/CLAUDE.md", content: null, isFolder: false },
    ];
    expect(extractClaudeMd(files)).toBeNull();
  });

  it("returns null for empty file list", () => {
    expect(extractClaudeMd([])).toBeNull();
  });

  it("does not match partial paths like /sub/CLAUDE.md", () => {
    const files: SwitchboardFile[] = [
      { path: "/sub/CLAUDE.md", content: "wrong one", isFolder: false },
    ];
    expect(extractClaudeMd(files)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

describe("buildSystemPrompt", () => {
  it("includes base role section", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toContain("helpful AI assistant");
    expect(prompt).toContain("Switchboard integrations");
  });

  it("includes dev environment instructions", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toContain("dev environment");
    expect(prompt).toContain("Python 3");
    expect(prompt).toContain("sudo access");
    expect(prompt).toContain("vault_get_secret");
  });

  it("includes write action guardrails for external services", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toContain("ask the user for confirmation");
    expect(prompt).toContain("Local file operations");
  });

  it("includes Slack formatting rules", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toContain("Slack mrkdwn");
    expect(prompt).toContain("*bold*");
    expect(prompt).toContain("_italic_");
    expect(prompt).toContain("<url|text>");
    expect(prompt).toContain("Do NOT use # headings");
  });

  it("does not include CLAUDE.md section when null", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).not.toContain("custom instructions");
  });

  it("includes CLAUDE.md content when provided", () => {
    const prompt = buildSystemPrompt("Always respond in French.");
    expect(prompt).toContain("custom instructions");
    expect(prompt).toContain("Always respond in French.");
  });

  it("places CLAUDE.md before Slack formatting rules", () => {
    const prompt = buildSystemPrompt("My instructions here.");
    const claudeMdIndex = prompt.indexOf("My instructions here.");
    const slackIndex = prompt.indexOf("Slack mrkdwn");
    expect(claudeMdIndex).toBeLessThan(slackIndex);
  });

  it("includes more sections when CLAUDE.md is provided", () => {
    const withClaudeMd = buildSystemPrompt("test");
    const withoutClaudeMd = buildSystemPrompt(null);
    expect(withClaudeMd.length).toBeGreaterThan(withoutClaudeMd.length);
    expect(withClaudeMd).toContain("test");
    expect(withoutClaudeMd).not.toContain("custom instructions");
  });
});

// ---------------------------------------------------------------------------
// Memory instructions
// ---------------------------------------------------------------------------

describe("memory instructions", () => {
  const DATE = "2026-03-06";

  it("includes recall_memories and save_memory references", () => {
    const prompt = buildSystemPrompt(null, DATE);
    expect(prompt).toContain("recall_memories");
    expect(prompt).toContain("save_memory");
  });

  it("includes file_read and file_write MCP tool references", () => {
    const prompt = buildSystemPrompt(null, DATE);
    expect(prompt).toContain("file_read");
    expect(prompt).toContain("file_write");
  });

  it("interpolates the provided date into daily log key", () => {
    const prompt = buildSystemPrompt(null, DATE);
    expect(prompt).toContain("daily/2026-03-06");
  });

  it("interpolates different dates correctly", () => {
    const prompt1 = buildSystemPrompt(null, "2025-01-01");
    const prompt2 = buildSystemPrompt(null, "2030-12-31");
    expect(prompt1).toContain("daily/2025-01-01");
    expect(prompt1).not.toContain("daily/2030-12-31");
    expect(prompt2).toContain("daily/2030-12-31");
    expect(prompt2).not.toContain("daily/2025-01-01");
  });

  it("defaults date when not provided", () => {
    const prompt = buildSystemPrompt(null);
    const today = new Date().toISOString().split("T")[0];
    expect(prompt).toContain(`daily/${today}`);
  });

  it("prohibits local filesystem writes for persistence", () => {
    const prompt = buildSystemPrompt(null, DATE);
    expect(prompt).toContain("Never write memory or .claude files to the local filesystem");
  });

  it("mentions ephemeral environment and lost writes", () => {
    const prompt = buildSystemPrompt(null, DATE);
    expect(prompt).toContain("ephemeral");
    expect(prompt).toContain("Local writes are lost when the session ends");
  });

  it("instructs file_write for /CLAUDE.md updates", () => {
    const prompt = buildSystemPrompt(null, DATE);
    expect(prompt).toContain("file_write");
    expect(prompt).toContain('path: "/CLAUDE.md"');
    expect(prompt).toContain("Do NOT write to the local filesystem");
  });

  it("references MCP server instructions for DRY conventions", () => {
    const prompt = buildSystemPrompt(null, DATE);
    expect(prompt).toContain("Switchboard MCP server instructions");
    expect(prompt).toContain("memory conventions");
  });

  it("directs recall_memories before first response", () => {
    const prompt = buildSystemPrompt(null, DATE);
    expect(prompt).toContain("BEFORE your first response");
  });

  it("directs append-only daily logs", () => {
    const prompt = buildSystemPrompt(null, DATE);
    expect(prompt).toContain("append");
    expect(prompt).toContain("never overwrite");
  });

  it("directs save_memory with MEMORY key for core memory", () => {
    const prompt = buildSystemPrompt(null, DATE);
    expect(prompt).toContain('save_memory with key "MEMORY"');
  });

  it("contains all 5 numbered behavioral rules", () => {
    const prompt = buildSystemPrompt(null, DATE);
    expect(prompt).toContain("1.");
    expect(prompt).toContain("2.");
    expect(prompt).toContain("3.");
    expect(prompt).toContain("4.");
    expect(prompt).toContain("5.");
  });

  // --- Ordering ---

  it("places memory instructions before dev environment instructions", () => {
    const prompt = buildSystemPrompt(null, DATE);
    const memoryIndex = prompt.indexOf("persistent memory system");
    const devIndex = prompt.indexOf("dev environment with:");
    expect(memoryIndex).toBeGreaterThan(-1);
    expect(devIndex).toBeGreaterThan(-1);
    expect(memoryIndex).toBeLessThan(devIndex);
  });

  it("places memory instructions after identity section", () => {
    const prompt = buildSystemPrompt(null, DATE);
    const identityIndex = prompt.indexOf("helpful AI assistant");
    const memoryIndex = prompt.indexOf("persistent memory system");
    expect(identityIndex).toBeGreaterThan(-1);
    expect(memoryIndex).toBeGreaterThan(-1);
    expect(identityIndex).toBeLessThan(memoryIndex);
  });

  it("maintains full section order: identity → memory → dev → guardrails → Slack", () => {
    const prompt = buildSystemPrompt(null, DATE);
    const identity = prompt.indexOf("helpful AI assistant");
    const memory = prompt.indexOf("persistent memory system");
    const dev = prompt.indexOf("dev environment with:");
    const guardrails = prompt.indexOf("ask the user for confirmation");
    const slack = prompt.indexOf("Slack mrkdwn");

    for (const idx of [identity, memory, dev, guardrails, slack]) {
      expect(idx).toBeGreaterThan(-1);
    }
    expect(identity).toBeLessThan(memory);
    expect(memory).toBeLessThan(dev);
    expect(dev).toBeLessThan(guardrails);
    expect(guardrails).toBeLessThan(slack);
  });

  it("places CLAUDE.md between guardrails and Slack when provided", () => {
    const prompt = buildSystemPrompt("Custom user rules", DATE);
    const guardrails = prompt.indexOf("ask the user for confirmation");
    const claudeMd = prompt.indexOf("Custom user rules");
    const slack = prompt.indexOf("Slack mrkdwn");

    for (const idx of [guardrails, claudeMd, slack]) {
      expect(idx).toBeGreaterThan(-1);
    }
    expect(guardrails).toBeLessThan(claudeMd);
    expect(claudeMd).toBeLessThan(slack);
  });

  // --- Interaction with CLAUDE.md ---

  it("includes memory instructions even when CLAUDE.md is provided", () => {
    const prompt = buildSystemPrompt("Be concise.", DATE);
    expect(prompt).toContain("persistent memory system");
    expect(prompt).toContain("recall_memories");
    expect(prompt).toContain("save_memory");
    expect(prompt).toContain("daily/2026-03-06");
    expect(prompt).toContain("Be concise.");
  });

  // --- Backward compatibility ---

  it("works with only claudeMdContent (no todayDate) - backward compat", () => {
    const prompt = buildSystemPrompt("My rules");
    expect(prompt).toContain("persistent memory system");
    expect(prompt).toContain("My rules");
    // Should have a valid date in daily/ key
    expect(prompt).toMatch(/daily\/\d{4}-\d{2}-\d{2}/);
  });
});
