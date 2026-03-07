import { describe, it, expect } from "vitest";
import { namespaceTool, stripNamespace } from "./proxy-namespace";

describe("namespaceTool", () => {
  it("prefixes generic tool names", () => {
    expect(namespaceTool("github", "create_branch")).toBe("github__create_branch");
    expect(namespaceTool("supabase", "list_tables")).toBe("supabase__list_tables");
    expect(namespaceTool("granola", "list_meetings")).toBe("granola__list_meetings");
    expect(namespaceTool("context7", "resolve-library-id")).toBe("context7__resolve-library-id");
    expect(namespaceTool("shortcut", "stories-search")).toBe("shortcut__stories-search");
  });

  it("skips prefix when tool name starts with integration ID", () => {
    expect(namespaceTool("slack", "slack_send_message")).toBe("slack_send_message");
    expect(namespaceTool("firecrawl", "firecrawl_scrape")).toBe("firecrawl_scrape");
  });

  it("skips prefix when tool name ends with integration ID", () => {
    expect(namespaceTool("exa", "web_search_exa")).toBe("web_search_exa");
    expect(namespaceTool("exa", "deep_search_exa")).toBe("deep_search_exa");
    expect(namespaceTool("exa", "find_similar_exa")).toBe("find_similar_exa");
    expect(namespaceTool("exa", "company_research_exa")).toBe("company_research_exa");
  });

  it("skips prefix when tool name contains integration ID mid-word-boundary", () => {
    expect(namespaceTool("granola", "query_granola_meetings")).toBe("query_granola_meetings");
  });

  it("prefixes when integration ID is not a word boundary match", () => {
    // "exa" is not a word boundary in "example_tool"
    expect(namespaceTool("exa", "example_tool")).toBe("exa__example_tool");
  });

  it("prefixes tools without the integration ID", () => {
    expect(namespaceTool("exa", "deep_researcher_start")).toBe("exa__deep_researcher_start");
    expect(namespaceTool("exa", "deep_researcher_check")).toBe("exa__deep_researcher_check");
  });

  it("handles hyphen-delimited tool names", () => {
    expect(namespaceTool("context7", "context7-resolve")).toBe("context7-resolve");
  });
});

describe("stripNamespace", () => {
  it("strips double-underscore prefix", () => {
    expect(stripNamespace("github__create_branch")).toEqual({
      integrationId: "github",
      toolName: "create_branch",
    });
    expect(stripNamespace("supabase__list_tables")).toEqual({
      integrationId: "supabase",
      toolName: "list_tables",
    });
  });

  it("returns null for tools without __ prefix", () => {
    expect(stripNamespace("slack_send_message")).toBeNull();
    expect(stripNamespace("web_search_exa")).toBeNull();
    expect(stripNamespace("firecrawl_scrape")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(stripNamespace("")).toBeNull();
  });

  it("returns null when __ is at position 0", () => {
    expect(stripNamespace("__something")).toBeNull();
  });
});
