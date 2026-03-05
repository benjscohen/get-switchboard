import { describe, it, expect } from "vitest";
import * as s from "./schemas";
import { LINKEDIN_ADS_TOOLS } from "./tools";

// ── Shared fragments ──

describe("shared fragments", () => {
  it("adAccountId accepts a numeric string", () => {
    expect(s.adAccountId.parse("512345678")).toBe("512345678");
  });

  it("pageSize accepts valid range", () => {
    expect(s.pageSize.parse(25)).toBe(25);
    expect(s.pageSize.parse(1000)).toBe(1000);
  });

  it("pageSize rejects out of range", () => {
    expect(() => s.pageSize.parse(0)).toThrow();
    expect(() => s.pageSize.parse(1001)).toThrow();
  });

  it("pageSize is optional", () => {
    expect(s.pageSize.parse(undefined)).toBeUndefined();
  });

  it("dateRange requires all fields", () => {
    const valid = {
      start_year: 2025,
      start_month: 1,
      start_day: 1,
      end_year: 2025,
      end_month: 12,
      end_day: 31,
    };
    expect(s.dateRange.parse(valid)).toEqual(valid);
  });

  it("dateRange rejects invalid month", () => {
    expect(() =>
      s.dateRange.parse({
        start_year: 2025,
        start_month: 13,
        start_day: 1,
        end_year: 2025,
        end_month: 1,
        end_day: 1,
      })
    ).toThrow();
  });
});

// ── 1. Ad Accounts ──

describe("Ad Account schemas", () => {
  it("searchAccountsSchema accepts empty object", () => {
    expect(s.searchAccountsSchema.parse({})).toEqual({});
  });

  it("searchAccountsSchema accepts pagination", () => {
    const input = { page_size: 50, page_token: "abc" };
    expect(s.searchAccountsSchema.parse(input)).toEqual(input);
  });

  it("getAccountSchema requires ad_account_id", () => {
    expect(() => s.getAccountSchema.parse({})).toThrow();
    expect(s.getAccountSchema.parse({ ad_account_id: "123" })).toEqual({
      ad_account_id: "123",
    });
  });

  it("updateAccountSchema requires ad_account_id", () => {
    expect(() => s.updateAccountSchema.parse({})).toThrow();
    expect(
      s.updateAccountSchema.parse({
        ad_account_id: "123",
        name: "New Name",
      })
    ).toEqual({ ad_account_id: "123", name: "New Name" });
  });

  it("updateAccountSchema accepts notification_emails", () => {
    const input = {
      ad_account_id: "123",
      notification_emails: ["a@b.com"],
    };
    expect(s.updateAccountSchema.parse(input)).toEqual(input);
  });
});

// ── 2. Campaign Groups ──

describe("Campaign Group schemas", () => {
  it("searchCampaignGroupsSchema requires ad_account_id", () => {
    expect(() => s.searchCampaignGroupsSchema.parse({})).toThrow();
  });

  it("searchCampaignGroupsSchema accepts filters", () => {
    const input = {
      ad_account_id: "123",
      status: "ACTIVE" as const,
      name: "test",
    };
    expect(s.searchCampaignGroupsSchema.parse(input)).toMatchObject(input);
  });

  it("searchCampaignGroupsSchema rejects invalid status", () => {
    expect(() =>
      s.searchCampaignGroupsSchema.parse({
        ad_account_id: "123",
        status: "INVALID",
      })
    ).toThrow();
  });

  it("getCampaignGroupSchema requires both IDs", () => {
    expect(() =>
      s.getCampaignGroupSchema.parse({ ad_account_id: "123" })
    ).toThrow();
    expect(
      s.getCampaignGroupSchema.parse({
        ad_account_id: "123",
        campaign_group_id: "456",
      })
    ).toBeDefined();
  });

  it("createCampaignGroupSchema requires name and ad_account_id", () => {
    expect(() =>
      s.createCampaignGroupSchema.parse({ ad_account_id: "123" })
    ).toThrow();
    expect(
      s.createCampaignGroupSchema.parse({
        ad_account_id: "123",
        name: "Test Group",
      })
    ).toBeDefined();
  });

  it("createCampaignGroupSchema accepts budget and schedule", () => {
    const input = {
      ad_account_id: "123",
      name: "Test",
      total_budget_amount: 10000,
      daily_budget_amount: 500,
      start_date: "2025-01-01",
      end_date: "2025-12-31",
    };
    expect(s.createCampaignGroupSchema.parse(input)).toEqual(input);
  });

  it("updateCampaignGroupSchema requires both IDs", () => {
    expect(() =>
      s.updateCampaignGroupSchema.parse({ ad_account_id: "123" })
    ).toThrow();
  });
});

// ── 3. Campaigns ──

describe("Campaign schemas", () => {
  it("searchCampaignsSchema requires ad_account_id", () => {
    expect(() => s.searchCampaignsSchema.parse({})).toThrow();
    expect(
      s.searchCampaignsSchema.parse({ ad_account_id: "123" })
    ).toBeDefined();
  });

  it("searchCampaignsSchema accepts all filters", () => {
    const input = {
      ad_account_id: "123",
      campaign_group_id: "456",
      status: "ACTIVE" as const,
      name: "test",
    };
    expect(s.searchCampaignsSchema.parse(input)).toMatchObject(input);
  });

  it("getCampaignSchema requires both IDs", () => {
    expect(() =>
      s.getCampaignSchema.parse({ ad_account_id: "123" })
    ).toThrow();
  });

  it("createCampaignSchema requires required fields", () => {
    expect(() => s.createCampaignSchema.parse({})).toThrow();
    const valid = {
      ad_account_id: "123",
      campaign_group_id: "456",
      name: "My Campaign",
      type: "SPONSORED_UPDATES" as const,
      daily_budget_amount: 5000,
    };
    expect(s.createCampaignSchema.parse(valid)).toMatchObject(valid);
  });

  it("createCampaignSchema validates type enum", () => {
    expect(() =>
      s.createCampaignSchema.parse({
        ad_account_id: "123",
        campaign_group_id: "456",
        name: "Test",
        type: "INVALID",
        daily_budget_amount: 5000,
      })
    ).toThrow();
  });

  it("createCampaignSchema accepts all optional fields", () => {
    const input = {
      ad_account_id: "123",
      campaign_group_id: "456",
      name: "Test",
      type: "SPONSORED_UPDATES" as const,
      daily_budget_amount: 5000,
      status: "PAUSED" as const,
      objective_type: "WEBSITE_VISITS" as const,
      cost_type: "CPC" as const,
      bid_amount: 200,
      targeting_criteria: '{"include":{}}',
      creative_selection: "OPTIMIZED" as const,
    };
    expect(s.createCampaignSchema.parse(input)).toEqual(input);
  });

  it("updateCampaignSchema requires both IDs", () => {
    expect(() =>
      s.updateCampaignSchema.parse({ ad_account_id: "123" })
    ).toThrow();
  });
});

// ── 4. Creatives ──

describe("Creative schemas", () => {
  it("searchCreativesSchema requires ad_account_id", () => {
    expect(() => s.searchCreativesSchema.parse({})).toThrow();
  });

  it("searchCreativesSchema validates status enum", () => {
    expect(() =>
      s.searchCreativesSchema.parse({
        ad_account_id: "123",
        status: "INVALID",
      })
    ).toThrow();
  });

  it("getCreativeSchema requires both IDs", () => {
    expect(() =>
      s.getCreativeSchema.parse({ ad_account_id: "123" })
    ).toThrow();
  });

  it("createCreativeSchema requires all required fields", () => {
    expect(() =>
      s.createCreativeSchema.parse({ ad_account_id: "123" })
    ).toThrow();
    const valid = {
      ad_account_id: "123",
      campaign_id: "456",
      content: '{"article":{"source":"https://example.com"}}',
    };
    expect(s.createCreativeSchema.parse(valid)).toMatchObject(valid);
  });

  it("updateCreativeSchema requires both IDs", () => {
    expect(() =>
      s.updateCreativeSchema.parse({ ad_account_id: "123" })
    ).toThrow();
  });
});

// ── 5. Ad Account Users ──

describe("Ad Account User schemas", () => {
  it("searchAccountUsersSchema requires ad_account_id", () => {
    expect(() => s.searchAccountUsersSchema.parse({})).toThrow();
  });

  it("createAccountUserSchema requires all fields", () => {
    expect(() =>
      s.createAccountUserSchema.parse({ ad_account_id: "123" })
    ).toThrow();
    const valid = {
      ad_account_id: "123",
      user_person_id: "abc",
      role: "VIEWER" as const,
    };
    expect(s.createAccountUserSchema.parse(valid)).toEqual(valid);
  });

  it("createAccountUserSchema validates role enum", () => {
    expect(() =>
      s.createAccountUserSchema.parse({
        ad_account_id: "123",
        user_person_id: "abc",
        role: "INVALID",
      })
    ).toThrow();
  });

  it("removeAccountUserSchema requires both IDs", () => {
    expect(() =>
      s.removeAccountUserSchema.parse({ ad_account_id: "123" })
    ).toThrow();
  });
});

// ── 6. Targeting ──

describe("Targeting schemas", () => {
  it("getTargetingFacetsSchema requires ad_account_id", () => {
    expect(() => s.getTargetingFacetsSchema.parse({})).toThrow();
  });

  it("searchTargetingEntitiesSchema requires all fields", () => {
    expect(() =>
      s.searchTargetingEntitiesSchema.parse({ ad_account_id: "123" })
    ).toThrow();
    const valid = {
      ad_account_id: "123",
      facet_urn: "urn:li:adTargetingFacet:locations",
      query: "San Francisco",
    };
    expect(s.searchTargetingEntitiesSchema.parse(valid)).toEqual(valid);
  });

  it("getTargetingEntitiesSchema requires entity_urns array", () => {
    expect(() =>
      s.getTargetingEntitiesSchema.parse({
        ad_account_id: "123",
        facet_urn: "urn:li:adTargetingFacet:locations",
      })
    ).toThrow();
    const valid = {
      ad_account_id: "123",
      facet_urn: "urn:li:adTargetingFacet:locations",
      entity_urns: ["urn:li:geo:123"],
    };
    expect(s.getTargetingEntitiesSchema.parse(valid)).toEqual(valid);
  });
});

// ── 7. Analytics ──

describe("Analytics schemas", () => {
  const validDateRange = {
    start_year: 2025,
    start_month: 1,
    start_day: 1,
    end_year: 2025,
    end_month: 1,
    end_day: 31,
  };

  it("getCampaignAnalyticsSchema requires all fields", () => {
    expect(() =>
      s.getCampaignAnalyticsSchema.parse({ ad_account_id: "123" })
    ).toThrow();
    const valid = {
      ad_account_id: "123",
      campaign_ids: ["456"],
      date_range: validDateRange,
    };
    expect(s.getCampaignAnalyticsSchema.parse(valid)).toBeDefined();
  });

  it("getCampaignAnalyticsSchema validates time_granularity", () => {
    expect(() =>
      s.getCampaignAnalyticsSchema.parse({
        ad_account_id: "123",
        campaign_ids: ["456"],
        date_range: validDateRange,
        time_granularity: "INVALID",
      })
    ).toThrow();
  });

  it("getCreativeAnalyticsSchema requires creative_ids", () => {
    expect(() =>
      s.getCreativeAnalyticsSchema.parse({
        ad_account_id: "123",
        date_range: validDateRange,
      })
    ).toThrow();
  });

  it("getAccountAnalyticsSchema requires ad_account_id and date_range", () => {
    expect(() =>
      s.getAccountAnalyticsSchema.parse({ ad_account_id: "123" })
    ).toThrow();
    const valid = {
      ad_account_id: "123",
      date_range: validDateRange,
    };
    expect(s.getAccountAnalyticsSchema.parse(valid)).toBeDefined();
  });
});

// ── 8. Conversions ──

describe("Conversion schemas", () => {
  it("searchConversionsSchema requires ad_account_id", () => {
    expect(() => s.searchConversionsSchema.parse({})).toThrow();
  });

  it("createConversionSchema requires all required fields", () => {
    expect(() =>
      s.createConversionSchema.parse({ ad_account_id: "123" })
    ).toThrow();
    const valid = {
      ad_account_id: "123",
      name: "Purchase",
      type: "PURCHASE" as const,
    };
    expect(s.createConversionSchema.parse(valid)).toMatchObject(valid);
  });

  it("createConversionSchema validates type enum", () => {
    expect(() =>
      s.createConversionSchema.parse({
        ad_account_id: "123",
        name: "Test",
        type: "INVALID",
      })
    ).toThrow();
  });

  it("createConversionSchema accepts optional attribution fields", () => {
    const input = {
      ad_account_id: "123",
      name: "Purchase",
      type: "PURCHASE" as const,
      attribution_type: "LAST_TOUCH_BY_CAMPAIGN" as const,
      post_click_attribution_window_size: 30,
      view_through_attribution_window_size: 7,
    };
    expect(s.createConversionSchema.parse(input)).toEqual(input);
  });
});

// ── 9. Lead Gen Forms ──

describe("Lead Gen Form schemas", () => {
  it("searchLeadGenFormsSchema requires ad_account_id", () => {
    expect(() => s.searchLeadGenFormsSchema.parse({})).toThrow();
  });

  it("getLeadGenFormResponsesSchema requires both IDs", () => {
    expect(() =>
      s.getLeadGenFormResponsesSchema.parse({ ad_account_id: "123" })
    ).toThrow();
    const valid = {
      ad_account_id: "123",
      lead_gen_form_id: "456",
    };
    expect(s.getLeadGenFormResponsesSchema.parse(valid)).toEqual(valid);
  });
});

// ── Tool count ──

describe("LINKEDIN_ADS_TOOLS", () => {
  it("has exactly 28 tools", () => {
    expect(LINKEDIN_ADS_TOOLS).toHaveLength(28);
  });

  it("all tools have unique names", () => {
    const names = LINKEDIN_ADS_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all tool names start with linkedin_ads_", () => {
    for (const tool of LINKEDIN_ADS_TOOLS) {
      expect(tool.name).toMatch(/^linkedin_ads_/);
    }
  });
});
