import {
  customerId,
  loginCustomerId,
  resourceName,
  listAccessibleCustomersSchema,
  getCustomerSchema,
  searchCampaignsSchema,
  getCampaignSchema,
  createCampaignSchema,
  updateCampaignSchema,
  removeCampaignSchema,
  searchAdGroupsSchema,
  createAdGroupSchema,
  updateAdGroupSchema,
  removeAdGroupSchema,
  searchAdsSchema,
  createResponsiveSearchAdSchema,
  updateAdSchema,
  removeAdSchema,
  searchKeywordsSchema,
  addKeywordsSchema,
  updateKeywordSchema,
  removeKeywordSchema,
  searchBudgetsSchema,
  createBudgetSchema,
  updateBudgetSchema,
  querySchema,
  getCampaignPerformanceSchema,
  getKeywordPerformanceSchema,
} from "./schemas";
import { GOOGLE_ADS_TOOLS } from "./tools";

// ── Shared fragments ──

describe("shared fragments", () => {
  it("customerId requires a string", () => {
    expect(() => customerId.parse(undefined)).toThrow();
    expect(customerId.parse("1234567890")).toBe("1234567890");
  });

  it("loginCustomerId is optional", () => {
    expect(loginCustomerId.parse(undefined)).toBeUndefined();
    expect(loginCustomerId.parse("9876543210")).toBe("9876543210");
  });

  it("resourceName requires a string", () => {
    expect(() => resourceName.parse(undefined)).toThrow();
    expect(resourceName.parse("customers/123/campaigns/456")).toBe(
      "customers/123/campaigns/456"
    );
  });
});

// ── Account ──

describe("listAccessibleCustomersSchema", () => {
  it("accepts empty object", () => {
    const result = listAccessibleCustomersSchema.parse({});
    expect(result).toBeDefined();
  });
});

describe("getCustomerSchema", () => {
  it("requires customer_id", () => {
    expect(() => getCustomerSchema.parse({})).toThrow();
  });

  it("accepts valid input", () => {
    const result = getCustomerSchema.parse({ customer_id: "1234567890" });
    expect(result.customer_id).toBe("1234567890");
  });

  it("accepts optional login_customer_id", () => {
    const result = getCustomerSchema.parse({
      customer_id: "123",
      login_customer_id: "456",
    });
    expect(result.login_customer_id).toBe("456");
  });
});

// ── Campaigns ──

describe("searchCampaignsSchema", () => {
  it("requires customer_id", () => {
    expect(() => searchCampaignsSchema.parse({})).toThrow();
  });

  it.each(["ENABLED", "PAUSED", "REMOVED"] as const)(
    "accepts status '%s'",
    (status) => {
      const result = searchCampaignsSchema.parse({
        customer_id: "123",
        status,
      });
      expect(result.status).toBe(status);
    }
  );

  it("rejects invalid status", () => {
    expect(() =>
      searchCampaignsSchema.parse({ customer_id: "123", status: "DELETED" })
    ).toThrow();
  });

  it("accepts limit", () => {
    const result = searchCampaignsSchema.parse({
      customer_id: "123",
      limit: 50,
    });
    expect(result.limit).toBe(50);
  });
});

describe("getCampaignSchema", () => {
  it("requires customer_id and resource_name", () => {
    expect(() => getCampaignSchema.parse({})).toThrow();
    expect(() => getCampaignSchema.parse({ customer_id: "123" })).toThrow();
  });

  it("accepts valid input", () => {
    const result = getCampaignSchema.parse({
      customer_id: "123",
      resource_name: "customers/123/campaigns/456",
    });
    expect(result.resource_name).toBe("customers/123/campaigns/456");
  });
});

describe("createCampaignSchema", () => {
  it("requires customer_id, name, advertising_channel_type, budget_resource_name", () => {
    expect(() => createCampaignSchema.parse({})).toThrow();
    expect(() =>
      createCampaignSchema.parse({ customer_id: "123", name: "Test" })
    ).toThrow();
  });

  it("accepts valid create input", () => {
    const result = createCampaignSchema.parse({
      customer_id: "123",
      name: "My Campaign",
      advertising_channel_type: "SEARCH",
      budget_resource_name: "customers/123/campaignBudgets/789",
    });
    expect(result.name).toBe("My Campaign");
    expect(result.advertising_channel_type).toBe("SEARCH");
  });

  it.each([
    "SEARCH",
    "DISPLAY",
    "SHOPPING",
    "VIDEO",
    "MULTI_CHANNEL",
  ] as const)("accepts channel type '%s'", (type) => {
    const result = createCampaignSchema.parse({
      customer_id: "123",
      name: "Test",
      advertising_channel_type: type,
      budget_resource_name: "customers/123/campaignBudgets/1",
    });
    expect(result.advertising_channel_type).toBe(type);
  });

  it.each([
    "TARGET_CPA",
    "TARGET_ROAS",
    "MAXIMIZE_CONVERSIONS",
    "MAXIMIZE_CONVERSION_VALUE",
    "MANUAL_CPC",
    "MANUAL_CPM",
  ] as const)("accepts bidding strategy '%s'", (strategy) => {
    const result = createCampaignSchema.parse({
      customer_id: "123",
      name: "Test",
      advertising_channel_type: "SEARCH",
      budget_resource_name: "customers/123/campaignBudgets/1",
      bidding_strategy_type: strategy,
    });
    expect(result.bidding_strategy_type).toBe(strategy);
  });

  it("rejects invalid bidding strategy", () => {
    expect(() =>
      createCampaignSchema.parse({
        customer_id: "123",
        name: "Test",
        advertising_channel_type: "SEARCH",
        budget_resource_name: "customers/123/campaignBudgets/1",
        bidding_strategy_type: "INVALID",
      })
    ).toThrow();
  });
});

describe("updateCampaignSchema", () => {
  it("requires customer_id and resource_name", () => {
    expect(() => updateCampaignSchema.parse({})).toThrow();
  });

  it("accepts optional update fields", () => {
    const result = updateCampaignSchema.parse({
      customer_id: "123",
      resource_name: "customers/123/campaigns/456",
      name: "New Name",
      status: "PAUSED",
    });
    expect(result.name).toBe("New Name");
    expect(result.status).toBe("PAUSED");
  });
});

describe("removeCampaignSchema", () => {
  it("requires customer_id and resource_name", () => {
    expect(() => removeCampaignSchema.parse({})).toThrow();
  });

  it("accepts valid input", () => {
    const result = removeCampaignSchema.parse({
      customer_id: "123",
      resource_name: "customers/123/campaigns/456",
    });
    expect(result.resource_name).toBe("customers/123/campaigns/456");
  });
});

// ── Ad Groups ──

describe("searchAdGroupsSchema", () => {
  it("requires customer_id", () => {
    expect(() => searchAdGroupsSchema.parse({})).toThrow();
  });

  it("accepts optional filters", () => {
    const result = searchAdGroupsSchema.parse({
      customer_id: "123",
      campaign_resource_name: "customers/123/campaigns/456",
      status: "ENABLED",
    });
    expect(result.campaign_resource_name).toBe("customers/123/campaigns/456");
  });
});

describe("createAdGroupSchema", () => {
  it("requires customer_id, campaign_resource_name, name", () => {
    expect(() => createAdGroupSchema.parse({})).toThrow();
    expect(() =>
      createAdGroupSchema.parse({ customer_id: "123" })
    ).toThrow();
  });

  it("accepts valid input", () => {
    const result = createAdGroupSchema.parse({
      customer_id: "123",
      campaign_resource_name: "customers/123/campaigns/456",
      name: "My Ad Group",
      type: "SEARCH_STANDARD",
      cpc_bid_micros: 1500000,
    });
    expect(result.name).toBe("My Ad Group");
    expect(result.cpc_bid_micros).toBe(1500000);
  });

  it.each([
    "SEARCH_STANDARD",
    "DISPLAY_STANDARD",
    "SHOPPING_PRODUCT_ADS",
    "VIDEO_TRUE_VIEW_IN_STREAM",
  ] as const)("accepts type '%s'", (type) => {
    const result = createAdGroupSchema.parse({
      customer_id: "123",
      campaign_resource_name: "customers/123/campaigns/456",
      name: "Test",
      type,
    });
    expect(result.type).toBe(type);
  });
});

describe("updateAdGroupSchema", () => {
  it("requires customer_id and resource_name", () => {
    expect(() => updateAdGroupSchema.parse({})).toThrow();
  });

  it("accepts update fields", () => {
    const result = updateAdGroupSchema.parse({
      customer_id: "123",
      resource_name: "customers/123/adGroups/789",
      name: "Updated",
      status: "PAUSED",
      cpc_bid_micros: 2000000,
    });
    expect(result.name).toBe("Updated");
  });
});

describe("removeAdGroupSchema", () => {
  it("requires customer_id and resource_name", () => {
    expect(() => removeAdGroupSchema.parse({})).toThrow();
  });
});

// ── Ads ──

describe("searchAdsSchema", () => {
  it("requires customer_id", () => {
    expect(() => searchAdsSchema.parse({})).toThrow();
  });

  it("accepts optional filters", () => {
    const result = searchAdsSchema.parse({
      customer_id: "123",
      ad_group_resource_name: "customers/123/adGroups/789",
      status: "ENABLED",
    });
    expect(result.ad_group_resource_name).toBe("customers/123/adGroups/789");
  });
});

describe("createResponsiveSearchAdSchema", () => {
  it("requires customer_id, ad_group_resource_name, headlines, descriptions, final_urls", () => {
    expect(() => createResponsiveSearchAdSchema.parse({})).toThrow();
  });

  it("accepts valid input", () => {
    const result = createResponsiveSearchAdSchema.parse({
      customer_id: "123",
      ad_group_resource_name: "customers/123/adGroups/789",
      headlines: '[{"text":"Buy Now"},{"text":"Free Shipping"},{"text":"Sale"}]',
      descriptions: '[{"text":"Great deals await."},{"text":"Shop today."}]',
      final_urls: '["https://example.com"]',
      path1: "shop",
      path2: "deals",
    });
    expect(result.path1).toBe("shop");
    expect(result.path2).toBe("deals");
  });
});

describe("updateAdSchema", () => {
  it("requires customer_id, ad_group_resource_name, ad_id", () => {
    expect(() => updateAdSchema.parse({})).toThrow();
  });

  it("accepts valid input", () => {
    const result = updateAdSchema.parse({
      customer_id: "123",
      ad_group_resource_name: "customers/123/adGroups/789",
      ad_id: "111",
      status: "PAUSED",
    });
    expect(result.status).toBe("PAUSED");
  });
});

describe("removeAdSchema", () => {
  it("requires customer_id, ad_group_resource_name, ad_id", () => {
    expect(() => removeAdSchema.parse({})).toThrow();
  });
});

// ── Keywords ──

describe("searchKeywordsSchema", () => {
  it("requires customer_id", () => {
    expect(() => searchKeywordsSchema.parse({})).toThrow();
  });

  it("accepts optional filters", () => {
    const result = searchKeywordsSchema.parse({
      customer_id: "123",
      ad_group_resource_name: "customers/123/adGroups/789",
      status: "ENABLED",
      limit: 50,
    });
    expect(result.limit).toBe(50);
  });
});

describe("addKeywordsSchema", () => {
  it("requires customer_id, ad_group_resource_name, keywords", () => {
    expect(() => addKeywordsSchema.parse({})).toThrow();
  });

  it("accepts valid input", () => {
    const result = addKeywordsSchema.parse({
      customer_id: "123",
      ad_group_resource_name: "customers/123/adGroups/789",
      keywords:
        '[{"text":"running shoes","matchType":"BROAD","cpcBidMicros":1500000}]',
    });
    expect(result.keywords).toContain("running shoes");
  });
});

describe("updateKeywordSchema", () => {
  it("requires customer_id and resource_name", () => {
    expect(() => updateKeywordSchema.parse({})).toThrow();
  });

  it("accepts update fields", () => {
    const result = updateKeywordSchema.parse({
      customer_id: "123",
      resource_name: "customers/123/adGroupCriteria/789~111",
      status: "PAUSED",
      cpc_bid_micros: 2000000,
    });
    expect(result.cpc_bid_micros).toBe(2000000);
  });
});

describe("removeKeywordSchema", () => {
  it("requires customer_id and resource_name", () => {
    expect(() => removeKeywordSchema.parse({})).toThrow();
  });
});

// ── Budgets ──

describe("searchBudgetsSchema", () => {
  it("requires customer_id", () => {
    expect(() => searchBudgetsSchema.parse({})).toThrow();
  });

  it("accepts valid input", () => {
    const result = searchBudgetsSchema.parse({
      customer_id: "123",
      limit: 50,
    });
    expect(result.limit).toBe(50);
  });
});

describe("createBudgetSchema", () => {
  it("requires customer_id, name, amount_micros", () => {
    expect(() => createBudgetSchema.parse({})).toThrow();
  });

  it("accepts valid input", () => {
    const result = createBudgetSchema.parse({
      customer_id: "123",
      name: "Daily Budget",
      amount_micros: 10000000,
      delivery_method: "STANDARD",
      explicitly_shared: false,
    });
    expect(result.name).toBe("Daily Budget");
    expect(result.amount_micros).toBe(10000000);
  });

  it.each(["STANDARD", "ACCELERATED"] as const)(
    "accepts delivery_method '%s'",
    (method) => {
      const result = createBudgetSchema.parse({
        customer_id: "123",
        name: "Budget",
        amount_micros: 5000000,
        delivery_method: method,
      });
      expect(result.delivery_method).toBe(method);
    }
  );

  it("rejects invalid delivery_method", () => {
    expect(() =>
      createBudgetSchema.parse({
        customer_id: "123",
        name: "Budget",
        amount_micros: 5000000,
        delivery_method: "FAST",
      })
    ).toThrow();
  });
});

describe("updateBudgetSchema", () => {
  it("requires customer_id and resource_name", () => {
    expect(() => updateBudgetSchema.parse({})).toThrow();
  });

  it("accepts update fields", () => {
    const result = updateBudgetSchema.parse({
      customer_id: "123",
      resource_name: "customers/123/campaignBudgets/789",
      name: "New Name",
      amount_micros: 20000000,
    });
    expect(result.amount_micros).toBe(20000000);
  });
});

// ── Reporting / GAQL ──

describe("querySchema", () => {
  it("requires customer_id and query", () => {
    expect(() => querySchema.parse({})).toThrow();
    expect(() => querySchema.parse({ customer_id: "123" })).toThrow();
  });

  it("accepts valid input", () => {
    const result = querySchema.parse({
      customer_id: "123",
      query: "SELECT campaign.id FROM campaign",
      page_size: 500,
    });
    expect(result.query).toBe("SELECT campaign.id FROM campaign");
    expect(result.page_size).toBe(500);
  });

  it("accepts page_token", () => {
    const result = querySchema.parse({
      customer_id: "123",
      query: "SELECT campaign.id FROM campaign",
      page_token: "abc123",
    });
    expect(result.page_token).toBe("abc123");
  });
});

describe("getCampaignPerformanceSchema", () => {
  it("requires customer_id, date_from, date_to", () => {
    expect(() => getCampaignPerformanceSchema.parse({})).toThrow();
    expect(() =>
      getCampaignPerformanceSchema.parse({ customer_id: "123" })
    ).toThrow();
  });

  it("accepts valid input", () => {
    const result = getCampaignPerformanceSchema.parse({
      customer_id: "123",
      date_from: "2024-01-01",
      date_to: "2024-01-31",
      campaign_id: "456",
      limit: 50,
    });
    expect(result.date_from).toBe("2024-01-01");
    expect(result.campaign_id).toBe("456");
  });
});

describe("getKeywordPerformanceSchema", () => {
  it("requires customer_id, date_from, date_to", () => {
    expect(() => getKeywordPerformanceSchema.parse({})).toThrow();
  });

  it("accepts valid input with all filters", () => {
    const result = getKeywordPerformanceSchema.parse({
      customer_id: "123",
      date_from: "2024-01-01",
      date_to: "2024-01-31",
      campaign_id: "456",
      ad_group_id: "789",
      limit: 100,
    });
    expect(result.ad_group_id).toBe("789");
  });
});

// ── Tool count ──

describe("tool count", () => {
  it("exports exactly 25 tools", () => {
    expect(GOOGLE_ADS_TOOLS).toHaveLength(25);
  });
});

// ── Cross-cutting: schemas with required fields reject {} ──

describe("all schemas with required fields reject empty object", () => {
  it.each([
    ["getCustomerSchema", getCustomerSchema],
    ["searchCampaignsSchema", searchCampaignsSchema],
    ["getCampaignSchema", getCampaignSchema],
    ["createCampaignSchema", createCampaignSchema],
    ["updateCampaignSchema", updateCampaignSchema],
    ["removeCampaignSchema", removeCampaignSchema],
    ["searchAdGroupsSchema", searchAdGroupsSchema],
    ["createAdGroupSchema", createAdGroupSchema],
    ["updateAdGroupSchema", updateAdGroupSchema],
    ["removeAdGroupSchema", removeAdGroupSchema],
    ["searchAdsSchema", searchAdsSchema],
    ["createResponsiveSearchAdSchema", createResponsiveSearchAdSchema],
    ["updateAdSchema", updateAdSchema],
    ["removeAdSchema", removeAdSchema],
    ["searchKeywordsSchema", searchKeywordsSchema],
    ["addKeywordsSchema", addKeywordsSchema],
    ["updateKeywordSchema", updateKeywordSchema],
    ["removeKeywordSchema", removeKeywordSchema],
    ["searchBudgetsSchema", searchBudgetsSchema],
    ["createBudgetSchema", createBudgetSchema],
    ["updateBudgetSchema", updateBudgetSchema],
    ["querySchema", querySchema],
    ["getCampaignPerformanceSchema", getCampaignPerformanceSchema],
    ["getKeywordPerformanceSchema", getKeywordPerformanceSchema],
  ] as const)("%s rejects {}", (_name, schema) => {
    expect(() => schema.parse({})).toThrow();
  });
});
