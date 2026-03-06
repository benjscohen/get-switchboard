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
