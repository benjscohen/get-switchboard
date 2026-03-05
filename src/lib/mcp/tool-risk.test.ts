import { describe, it, expect } from "vitest";
import { getToolRisk, isRiskAllowedByScope } from "./tool-risk";

describe("getToolRisk", () => {
  // ── Static map lookups ──
  it("returns correct risk for statically mapped tools", () => {
    expect(getToolRisk("google_calendar_list_events")).toBe("read");
    expect(getToolRisk("google_gmail_send_message")).toBe("destructive");
    expect(getToolRisk("google_docs_insert_text")).toBe("write");
  });

  // ── Inferred read tools (the main bug fix) ──
  describe("infers read for search/list/get proxy tools", () => {
    const readTools = [
      "slack_search_channels",
      "slack_search_public",
      "slack_search_public_and_private",
      "slack_search_users",
      "protoniq__semantic_search",
      "protoniq__search",
      "slack_read_channel",
      "slack_read_thread",
      "slack_read_user_profile",
      "slack_read_canvas",
      "firecrawl_check_crawl_status",
      "some_tool_get_details",
      "custom__list_items",
      "my_find_records",
      "data_export_tool",
      "file_download_tool",
      "get_profile",
      "view_history",
      "get_info",
      "get_thumbnail",
      "list_revisions",
      "item_count",
    ];

    for (const tool of readTools) {
      it(`classifies "${tool}" as read`, () => {
        expect(getToolRisk(tool)).toBe("read");
      });
    }
  });

  // ── Inferred destructive tools ──
  describe("infers destructive for dangerous proxy tools", () => {
    const destructiveTools = [
      "slack_send_message",
      "custom__delete_record",
      "my_trash_item",
      "bulk_clear_data",
      "user_remove_access",
      "calendar_unshare_link",
      "gmail_reply_to_message",
      "gmail_forward_message",
      "gmail_batch_modify",
      "settings_manage_vacation",
      "inbox_manage_filters",
      "drive_manage_permissions",
      "records_purge",
      "data_destroy",
    ];

    for (const tool of destructiveTools) {
      it(`classifies "${tool}" as destructive`, () => {
        expect(getToolRisk(tool)).toBe("destructive");
      });
    }
  });

  // ── Inferred write (default) ──
  it("defaults to write for unknown tools with no pattern match", () => {
    expect(getToolRisk("custom_do_something")).toBe("write");
    expect(getToolRisk("unknown_tool")).toBe("write");
    expect(getToolRisk("protoniq__run_agent")).toBe("write");
  });

  // ── Destructive takes precedence over read ──
  it("destructive patterns take precedence over read patterns", () => {
    // "delete" is destructive even though it could theoretically match nothing read
    expect(getToolRisk("delete_search_results")).toBe("destructive");
  });
});

describe("isRiskAllowedByScope", () => {
  it("full scope allows everything", () => {
    expect(isRiskAllowedByScope("read", "full")).toBe(true);
    expect(isRiskAllowedByScope("write", "full")).toBe(true);
    expect(isRiskAllowedByScope("destructive", "full")).toBe(true);
  });

  it("read_write scope blocks destructive", () => {
    expect(isRiskAllowedByScope("read", "read_write")).toBe(true);
    expect(isRiskAllowedByScope("write", "read_write")).toBe(true);
    expect(isRiskAllowedByScope("destructive", "read_write")).toBe(false);
  });

  it("read_only scope allows only read", () => {
    expect(isRiskAllowedByScope("read", "read_only")).toBe(true);
    expect(isRiskAllowedByScope("write", "read_only")).toBe(false);
    expect(isRiskAllowedByScope("destructive", "read_only")).toBe(false);
  });
});
