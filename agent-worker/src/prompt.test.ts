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
    expect(prompt).toContain("Format responses for Slack");
    expect(prompt).toContain("Do NOT use markdown tables");
    expect(prompt).toContain("Keep responses concise");
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

  it("places CLAUDE.md after Slack formatting rules", () => {
    const prompt = buildSystemPrompt("My instructions here.");
    const claudeMdIndex = prompt.indexOf("My instructions here.");
    const slackIndex = prompt.indexOf("Format responses for Slack");
    expect(slackIndex).toBeLessThan(claudeMdIndex);
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

  it("places memory instructions after Slack formatting section", () => {
    const prompt = buildSystemPrompt(null, DATE);
    const slackIndex = prompt.indexOf("Format responses for Slack");
    const memoryIndex = prompt.indexOf("persistent memory system");
    expect(slackIndex).toBeGreaterThan(-1);
    expect(memoryIndex).toBeGreaterThan(-1);
    expect(slackIndex).toBeLessThan(memoryIndex);
  });

  it("maintains full section order: identity → FILE_UPLOAD → Slack → memory → dev → vault → guardrails → feedback", () => {
    const prompt = buildSystemPrompt(null, DATE);
    const identity = prompt.indexOf("helpful AI assistant");
    const fileUpload = prompt.indexOf("FILE_UPLOAD");
    const slack = prompt.indexOf("Format responses for Slack");
    const memory = prompt.indexOf("persistent memory system");
    const dev = prompt.indexOf("dev environment with:");
    const vault = prompt.indexOf("check the vault");
    const guardrails = prompt.indexOf("ask the user for confirmation");
    const feedback = prompt.indexOf("submit_feedback");

    for (const idx of [identity, fileUpload, slack, memory, dev, vault, guardrails, feedback]) {
      expect(idx).toBeGreaterThan(-1);
    }
    expect(identity).toBeLessThan(fileUpload);
    expect(fileUpload).toBeLessThan(slack);
    expect(slack).toBeLessThan(memory);
    expect(memory).toBeLessThan(dev);
    expect(dev).toBeLessThan(vault);
    expect(vault).toBeLessThan(guardrails);
    expect(guardrails).toBeLessThan(feedback);
  });

  it("places CLAUDE.md between guardrails and feedback when provided", () => {
    const prompt = buildSystemPrompt("Custom user rules", DATE);
    const guardrails = prompt.indexOf("ask the user for confirmation");
    const claudeMd = prompt.indexOf("Custom user rules");
    const feedback = prompt.indexOf("submit_feedback");

    for (const idx of [guardrails, claudeMd, feedback]) {
      expect(idx).toBeGreaterThan(-1);
    }
    expect(guardrails).toBeLessThan(claudeMd);
    expect(claudeMd).toBeLessThan(feedback);
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

// ---------------------------------------------------------------------------
// User identity
// ---------------------------------------------------------------------------

describe("user identity in system prompt", () => {
  it("includes name, email, and Slack user ID when all provided", () => {
    const prompt = buildSystemPrompt(null, undefined, {
      name: "Benj Cohen",
      email: "benj@example.com",
      slackUserId: "U05ABC123",
    });
    expect(prompt).toContain("Benj Cohen");
    expect(prompt).toContain("benj@example.com");
    expect(prompt).toContain("<@U05ABC123>");
  });

  it("includes the 'send it to me' disambiguation instruction", () => {
    const prompt = buildSystemPrompt(null, undefined, {
      name: "Benj Cohen",
    });
    expect(prompt).toContain("send it to me");
    expect(prompt).toContain("Do not guess or pick a different user");
  });

  it("omits identity block when no identity provided", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).not.toContain("currently speaking with");
  });

  it("omits identity block when identity is empty", () => {
    const prompt = buildSystemPrompt(null, undefined, {});
    expect(prompt).not.toContain("currently speaking with");
  });

  it("includes only name when only name is provided", () => {
    const prompt = buildSystemPrompt(null, undefined, { name: "Alice" });
    expect(prompt).toContain("Name: Alice");
    expect(prompt).not.toContain("Email:");
    expect(prompt).not.toContain("Slack user ID:");
  });

  it("includes only email when only email is provided", () => {
    const prompt = buildSystemPrompt(null, undefined, { email: "a@b.com" });
    expect(prompt).toContain("Email: a@b.com");
    expect(prompt).not.toContain("Name:");
    expect(prompt).not.toContain("Slack user ID:");
  });

  it("includes only Slack ID when only slackUserId is provided", () => {
    const prompt = buildSystemPrompt(null, undefined, { slackUserId: "U999" });
    expect(prompt).toContain("<@U999>");
    expect(prompt).not.toContain("Name:");
    expect(prompt).not.toContain("Email:");
  });

  it("places identity block after role description and before FILE_UPLOAD", () => {
    const prompt = buildSystemPrompt(null, undefined, {
      name: "Test User",
      email: "test@example.com",
      slackUserId: "U123",
    });
    const role = prompt.indexOf("helpful AI assistant");
    const identity = prompt.indexOf("currently speaking with");
    const fileUpload = prompt.indexOf("FILE_UPLOAD");
    expect(role).toBeGreaterThan(-1);
    expect(identity).toBeGreaterThan(-1);
    expect(fileUpload).toBeGreaterThan(-1);
    expect(role).toBeLessThan(identity);
    expect(identity).toBeLessThan(fileUpload);
  });

  it("works alongside CLAUDE.md and todayDate", () => {
    const prompt = buildSystemPrompt("Be concise.", "2026-03-07", {
      name: "Benj",
      email: "benj@test.com",
    });
    expect(prompt).toContain("Name: Benj");
    expect(prompt).toContain("Email: benj@test.com");
    expect(prompt).toContain("Be concise.");
    expect(prompt).toContain("daily/2026-03-07");
  });
});

// ---------------------------------------------------------------------------
// Vault credential lookup instructions
// ---------------------------------------------------------------------------

describe("vault credential lookup instructions", () => {
  it("instructs to prefer MCP integrations first", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toContain("MCP integrations first");
  });

  it("instructs to check vault before asking user", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toContain("check the vault");
    expect(prompt).toContain("vault_search_secrets");
  });

  it("directs heavy git work to vault PAT instead of GitHub MCP", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toContain("heavy git work");
    expect(prompt).toContain("GitHub PAT");
  });

  it("instructs to never expose secret values in responses", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toContain("Never expose secret values");
  });

  it("is placed after dev environment and before guardrails", () => {
    const prompt = buildSystemPrompt(null);
    const dev = prompt.indexOf("dev environment with:");
    const vault = prompt.indexOf("check the vault");
    const guardrails = prompt.indexOf("ask the user for confirmation");
    expect(dev).toBeGreaterThan(-1);
    expect(vault).toBeGreaterThan(-1);
    expect(guardrails).toBeGreaterThan(-1);
    expect(dev).toBeLessThan(vault);
    expect(vault).toBeLessThan(guardrails);
  });
});

// ---------------------------------------------------------------------------
// FILE_UPLOAD instructions
// ---------------------------------------------------------------------------

describe("FILE_UPLOAD instructions", () => {
  it("includes FILE_UPLOAD directive syntax", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toContain("FILE_UPLOAD:");
  });

  it("explains FILE_UPLOAD must be on its own line", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toContain("on its own line");
  });

  it("explains directive lines are stripped from message", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toContain("strips the directive");
  });

  it("includes an example with absolute path", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toContain("FILE_UPLOAD:/tmp/myfile.txt");
  });

  it("does NOT mention old output/ directory approach", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).not.toContain('"output/"');
    expect(prompt).not.toContain("output/ directory");
  });
});

// ---------------------------------------------------------------------------
// Feedback instructions
// ---------------------------------------------------------------------------

describe("feedback instructions", () => {
  it("includes submit_feedback reference", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toContain("submit_feedback");
  });

  it("mentions bug reporting", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toContain("bug");
  });

  it("comes after Slack formatting instructions", () => {
    const prompt = buildSystemPrompt(null);
    const slack = prompt.indexOf("Format responses for Slack");
    const feedback = prompt.indexOf("submit_feedback");
    expect(slack).toBeGreaterThan(-1);
    expect(feedback).toBeGreaterThan(-1);
    expect(slack).toBeLessThan(feedback);
  });
});
