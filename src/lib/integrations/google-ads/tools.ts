import type { IntegrationToolDef } from "../types";
import * as s from "./schemas";
import { flexParse } from "../shared/json-params";

// ── Client type ──

export type GoogleAdsClient = {
  baseUrl: string;
  headers: Record<string, string>;
};

// ── Helpers ──

function buildHeaders(
  client: GoogleAdsClient,
  loginCustomerId?: string
): Record<string, string> {
  const h = { ...client.headers };
  if (loginCustomerId) {
    h["login-customer-id"] = loginCustomerId.replace(/-/g, "");
  }
  return h;
}

async function gaqlSearch(
  client: GoogleAdsClient,
  customerId: string,
  query: string,
  headers: Record<string, string>,
  pageSize?: number,
  pageToken?: string
): Promise<unknown> {
  const body: Record<string, unknown> = { query };
  if (pageSize) body.pageSize = pageSize;
  if (pageToken) body.pageToken = pageToken;
  const res = await fetch(
    `${client.baseUrl}/customers/${customerId}/googleAds:search`,
    { method: "POST", headers, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Ads API ${res.status}: ${text}`);
  }
  return res.json();
}

async function mutate(
  client: GoogleAdsClient,
  customerId: string,
  resource: string,
  operations: unknown[],
  headers: Record<string, string>
): Promise<unknown> {
  const res = await fetch(
    `${client.baseUrl}/customers/${customerId}/${resource}:mutate`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ operations }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Ads API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Typed tool def ──

type GoogleAdsToolDef = Omit<IntegrationToolDef, "execute"> & {
  execute: (
    args: Record<string, unknown>,
    client: GoogleAdsClient
  ) => Promise<unknown>;
};

// ── Tool implementations ──

export const GOOGLE_ADS_TOOLS: GoogleAdsToolDef[] = [
  // ═══════════════════════════════════════════
  // Account (2)
  // ═══════════════════════════════════════════

  {
    name: "google_ads_list_accessible_customers",
    description:
      "List all Google Ads customer accounts accessible to the authenticated user",
    schema: s.listAccessibleCustomersSchema,
    execute: async (_a, client) => {
      const res = await fetch(
        `${client.baseUrl}/customers:listAccessibleCustomers`,
        { headers: client.headers }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Google Ads API ${res.status}: ${text}`);
      }
      return res.json();
    },
  },

  {
    name: "google_ads_get_customer",
    description: "Get account details for a Google Ads customer ID",
    schema: s.getCustomerSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const query = `SELECT customer.id, customer.descriptive_name, customer.currency_code,
        customer.time_zone, customer.auto_tagging_enabled, customer.manager,
        customer.test_account, customer.status
        FROM customer LIMIT 1`;
      return gaqlSearch(client, cid, query, h);
    },
  },

  // ═══════════════════════════════════════════
  // Campaigns (5)
  // ═══════════════════════════════════════════

  {
    name: "google_ads_search_campaigns",
    description:
      "List/search campaigns with optional status filtering",
    schema: s.searchCampaignsSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const conditions: string[] = [];
      if (a.status) conditions.push(`campaign.status = '${a.status}'`);
      else conditions.push("campaign.status != 'REMOVED'");
      const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
      const limit = (a.limit as number | undefined) ?? 100;
      const query = `SELECT campaign.id, campaign.name, campaign.status,
        campaign.advertising_channel_type, campaign.bidding_strategy_type,
        campaign.campaign_budget, campaign.start_date, campaign.end_date
        FROM campaign${where} LIMIT ${limit}`;
      return gaqlSearch(client, cid, query, h);
    },
  },

  {
    name: "google_ads_get_campaign",
    description: "Get a single campaign by resource name",
    schema: s.getCampaignSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const rn = a.resource_name as string;
      const query = `SELECT campaign.id, campaign.name, campaign.status,
        campaign.advertising_channel_type, campaign.bidding_strategy_type,
        campaign.campaign_budget, campaign.start_date, campaign.end_date,
        campaign.network_settings.target_google_search,
        campaign.network_settings.target_search_network,
        campaign.network_settings.target_content_network,
        campaign.target_cpa.target_cpa_micros,
        campaign.target_roas.target_roas
        FROM campaign WHERE campaign.resource_name = '${rn}' LIMIT 1`;
      return gaqlSearch(client, cid, query, h);
    },
  },

  {
    name: "google_ads_create_campaign",
    description:
      "Create a new campaign with budget and bidding strategy",
    schema: s.createCampaignSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const campaign: Record<string, unknown> = {
        name: a.name,
        advertisingChannelType: a.advertising_channel_type,
        status: (a.status as string | undefined) ?? "PAUSED",
        campaignBudget: a.budget_resource_name,
      };
      if (a.bidding_strategy_type) {
        const bst = a.bidding_strategy_type as string;
        if (bst === "MANUAL_CPC") campaign.manualCpc = {};
        else if (bst === "MANUAL_CPM") campaign.manualCpm = {};
        else if (bst === "MAXIMIZE_CONVERSIONS") campaign.maximizeConversions = {};
        else if (bst === "MAXIMIZE_CONVERSION_VALUE")
          campaign.maximizeConversionValue = {};
        else if (bst === "TARGET_CPA")
          campaign.targetCpa = {
            targetCpaMicros: a.target_cpa_micros
              ? String(a.target_cpa_micros)
              : undefined,
          };
        else if (bst === "TARGET_ROAS")
          campaign.targetRoas = { targetRoas: a.target_roas };
      }
      const networkSettings = flexParse(
        a.network_settings as string | undefined
      );
      if (networkSettings) campaign.networkSettings = networkSettings;
      return mutate(client, cid, "campaigns", [{ create: campaign }], h);
    },
  },

  {
    name: "google_ads_update_campaign",
    description: "Update campaign settings (name, status, budget, bidding)",
    schema: s.updateCampaignSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const campaign: Record<string, unknown> = {
        resourceName: a.resource_name,
      };
      const updateMask: string[] = [];
      if (a.name !== undefined) {
        campaign.name = a.name;
        updateMask.push("name");
      }
      if (a.status !== undefined) {
        campaign.status = a.status;
        updateMask.push("status");
      }
      if (a.budget_resource_name !== undefined) {
        campaign.campaignBudget = a.budget_resource_name;
        updateMask.push("campaignBudget");
      }
      if (a.target_cpa_micros !== undefined) {
        campaign.targetCpa = { targetCpaMicros: String(a.target_cpa_micros) };
        updateMask.push("targetCpa.targetCpaMicros");
      }
      if (a.target_roas !== undefined) {
        campaign.targetRoas = { targetRoas: a.target_roas };
        updateMask.push("targetRoas.targetRoas");
      }
      return mutate(
        client,
        cid,
        "campaigns",
        [{ update: campaign, updateMask: updateMask.join(",") }],
        h
      );
    },
  },

  {
    name: "google_ads_remove_campaign",
    description: "Remove a campaign",
    schema: s.removeCampaignSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      return mutate(
        client,
        cid,
        "campaigns",
        [{ remove: a.resource_name }],
        h
      );
    },
  },

  // ═══════════════════════════════════════════
  // Ad Groups (4)
  // ═══════════════════════════════════════════

  {
    name: "google_ads_search_ad_groups",
    description:
      "List/search ad groups with optional campaign filter",
    schema: s.searchAdGroupsSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const conditions: string[] = [];
      if (a.campaign_resource_name)
        conditions.push(
          `ad_group.campaign = '${a.campaign_resource_name}'`
        );
      if (a.status) conditions.push(`ad_group.status = '${a.status}'`);
      else conditions.push("ad_group.status != 'REMOVED'");
      const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
      const limit = (a.limit as number | undefined) ?? 100;
      const query = `SELECT ad_group.id, ad_group.name, ad_group.status,
        ad_group.type, ad_group.campaign, ad_group.cpc_bid_micros
        FROM ad_group${where} LIMIT ${limit}`;
      return gaqlSearch(client, cid, query, h);
    },
  },

  {
    name: "google_ads_create_ad_group",
    description: "Create an ad group in a campaign",
    schema: s.createAdGroupSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const adGroup: Record<string, unknown> = {
        campaign: a.campaign_resource_name,
        name: a.name,
        status: (a.status as string | undefined) ?? "ENABLED",
      };
      if (a.type) adGroup.type = a.type;
      if (a.cpc_bid_micros !== undefined)
        adGroup.cpcBidMicros = String(a.cpc_bid_micros);
      return mutate(client, cid, "adGroups", [{ create: adGroup }], h);
    },
  },

  {
    name: "google_ads_update_ad_group",
    description: "Update ad group settings",
    schema: s.updateAdGroupSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const adGroup: Record<string, unknown> = {
        resourceName: a.resource_name,
      };
      const updateMask: string[] = [];
      if (a.name !== undefined) {
        adGroup.name = a.name;
        updateMask.push("name");
      }
      if (a.status !== undefined) {
        adGroup.status = a.status;
        updateMask.push("status");
      }
      if (a.cpc_bid_micros !== undefined) {
        adGroup.cpcBidMicros = String(a.cpc_bid_micros);
        updateMask.push("cpcBidMicros");
      }
      return mutate(
        client,
        cid,
        "adGroups",
        [{ update: adGroup, updateMask: updateMask.join(",") }],
        h
      );
    },
  },

  {
    name: "google_ads_remove_ad_group",
    description: "Remove an ad group",
    schema: s.removeAdGroupSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      return mutate(
        client,
        cid,
        "adGroups",
        [{ remove: a.resource_name }],
        h
      );
    },
  },

  // ═══════════════════════════════════════════
  // Ads (4)
  // ═══════════════════════════════════════════

  {
    name: "google_ads_search_ads",
    description: "List/search ads with optional ad group filter",
    schema: s.searchAdsSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const conditions: string[] = [];
      if (a.ad_group_resource_name)
        conditions.push(
          `ad_group_ad.ad_group = '${a.ad_group_resource_name}'`
        );
      if (a.status) conditions.push(`ad_group_ad.status = '${a.status}'`);
      else conditions.push("ad_group_ad.status != 'REMOVED'");
      const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
      const limit = (a.limit as number | undefined) ?? 100;
      const query = `SELECT ad_group_ad.ad.id, ad_group_ad.ad.name,
        ad_group_ad.ad.type, ad_group_ad.status, ad_group_ad.ad_group,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions,
        ad_group_ad.ad.final_urls
        FROM ad_group_ad${where} LIMIT ${limit}`;
      return gaqlSearch(client, cid, query, h);
    },
  },

  {
    name: "google_ads_create_responsive_search_ad",
    description: "Create a responsive search ad",
    schema: s.createResponsiveSearchAdSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const headlines = flexParse(a.headlines as string) as unknown[];
      const descriptions = flexParse(a.descriptions as string) as unknown[];
      const finalUrls = flexParse(a.final_urls as string) as string[];
      const ad: Record<string, unknown> = {
        responsiveSearchAd: {
          headlines,
          descriptions,
          path1: a.path1,
          path2: a.path2,
        },
        finalUrls,
      };
      const adGroupAd: Record<string, unknown> = {
        adGroup: a.ad_group_resource_name,
        status: (a.status as string | undefined) ?? "ENABLED",
        ad,
      };
      return mutate(client, cid, "adGroupAds", [{ create: adGroupAd }], h);
    },
  },

  {
    name: "google_ads_update_ad",
    description: "Update an ad (pause/enable)",
    schema: s.updateAdSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const adGroupAd: Record<string, unknown> = {
        resourceName: `customers/${cid}/adGroupAds/${(a.ad_group_resource_name as string).split("/").pop()}~${a.ad_id}`,
      };
      const updateMask: string[] = [];
      if (a.status !== undefined) {
        adGroupAd.status = a.status;
        updateMask.push("status");
      }
      return mutate(
        client,
        cid,
        "adGroupAds",
        [{ update: adGroupAd, updateMask: updateMask.join(",") }],
        h
      );
    },
  },

  {
    name: "google_ads_remove_ad",
    description: "Remove an ad",
    schema: s.removeAdSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const resourceName = `customers/${cid}/adGroupAds/${(a.ad_group_resource_name as string).split("/").pop()}~${a.ad_id}`;
      return mutate(
        client,
        cid,
        "adGroupAds",
        [{ remove: resourceName }],
        h
      );
    },
  },

  // ═══════════════════════════════════════════
  // Keywords (4)
  // ═══════════════════════════════════════════

  {
    name: "google_ads_search_keywords",
    description:
      "List/search keywords with optional ad group filter",
    schema: s.searchKeywordsSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const conditions: string[] = [
        "ad_group_criterion.type = 'KEYWORD'",
      ];
      if (a.ad_group_resource_name)
        conditions.push(
          `ad_group_criterion.ad_group = '${a.ad_group_resource_name}'`
        );
      if (a.status)
        conditions.push(`ad_group_criterion.status = '${a.status}'`);
      else conditions.push("ad_group_criterion.status != 'REMOVED'");
      const where = ` WHERE ${conditions.join(" AND ")}`;
      const limit = (a.limit as number | undefined) ?? 100;
      const query = `SELECT ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
        ad_group_criterion.status, ad_group_criterion.ad_group,
        ad_group_criterion.cpc_bid_micros
        FROM ad_group_criterion${where} LIMIT ${limit}`;
      return gaqlSearch(client, cid, query, h);
    },
  },

  {
    name: "google_ads_add_keywords",
    description: "Add keywords to an ad group (supports batch)",
    schema: s.addKeywordsSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const keywords = flexParse(a.keywords as string) as Array<{
        text: string;
        matchType: string;
        cpcBidMicros?: number;
      }>;
      const operations = keywords.map((kw) => {
        const criterion: Record<string, unknown> = {
          adGroup: a.ad_group_resource_name,
          keyword: {
            text: kw.text,
            matchType: kw.matchType,
          },
          status: "ENABLED",
        };
        if (kw.cpcBidMicros !== undefined)
          criterion.cpcBidMicros = String(kw.cpcBidMicros);
        return { create: criterion };
      });
      return mutate(client, cid, "adGroupCriteria", operations, h);
    },
  },

  {
    name: "google_ads_update_keyword",
    description: "Update keyword bid or status",
    schema: s.updateKeywordSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const criterion: Record<string, unknown> = {
        resourceName: a.resource_name,
      };
      const updateMask: string[] = [];
      if (a.status !== undefined) {
        criterion.status = a.status;
        updateMask.push("status");
      }
      if (a.cpc_bid_micros !== undefined) {
        criterion.cpcBidMicros = String(a.cpc_bid_micros);
        updateMask.push("cpcBidMicros");
      }
      return mutate(
        client,
        cid,
        "adGroupCriteria",
        [{ update: criterion, updateMask: updateMask.join(",") }],
        h
      );
    },
  },

  {
    name: "google_ads_remove_keyword",
    description: "Remove a keyword",
    schema: s.removeKeywordSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      return mutate(
        client,
        cid,
        "adGroupCriteria",
        [{ remove: a.resource_name }],
        h
      );
    },
  },

  // ═══════════════════════════════════════════
  // Budgets (3)
  // ═══════════════════════════════════════════

  {
    name: "google_ads_search_budgets",
    description: "List campaign budgets",
    schema: s.searchBudgetsSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const limit = (a.limit as number | undefined) ?? 100;
      const query = `SELECT campaign_budget.id, campaign_budget.name,
        campaign_budget.amount_micros, campaign_budget.delivery_method,
        campaign_budget.explicitly_shared, campaign_budget.status,
        campaign_budget.total_amount_micros
        FROM campaign_budget LIMIT ${limit}`;
      return gaqlSearch(client, cid, query, h);
    },
  },

  {
    name: "google_ads_create_budget",
    description: "Create a campaign budget",
    schema: s.createBudgetSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const budget: Record<string, unknown> = {
        name: a.name,
        amountMicros: String(a.amount_micros),
      };
      if (a.delivery_method) budget.deliveryMethod = a.delivery_method;
      if (a.explicitly_shared !== undefined)
        budget.explicitlyShared = a.explicitly_shared;
      return mutate(client, cid, "campaignBudgets", [{ create: budget }], h);
    },
  },

  {
    name: "google_ads_update_budget",
    description: "Update a budget amount",
    schema: s.updateBudgetSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const budget: Record<string, unknown> = {
        resourceName: a.resource_name,
      };
      const updateMask: string[] = [];
      if (a.name !== undefined) {
        budget.name = a.name;
        updateMask.push("name");
      }
      if (a.amount_micros !== undefined) {
        budget.amountMicros = String(a.amount_micros);
        updateMask.push("amountMicros");
      }
      return mutate(
        client,
        cid,
        "campaignBudgets",
        [{ update: budget, updateMask: updateMask.join(",") }],
        h
      );
    },
  },

  // ═══════════════════════════════════════════
  // Reporting / GAQL (3)
  // ═══════════════════════════════════════════

  {
    name: "google_ads_query",
    description:
      "Run a custom GAQL query (power-user tool for any Google Ads report)",
    schema: s.querySchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      return gaqlSearch(
        client,
        cid,
        a.query as string,
        h,
        a.page_size as number | undefined,
        a.page_token as string | undefined
      );
    },
  },

  {
    name: "google_ads_get_campaign_performance",
    description: "Get campaign performance metrics for a date range",
    schema: s.getCampaignPerformanceSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const conditions = [
        `segments.date >= '${a.date_from}'`,
        `segments.date <= '${a.date_to}'`,
      ];
      if (a.campaign_id)
        conditions.push(`campaign.id = ${a.campaign_id}`);
      const limit = (a.limit as number | undefined) ?? 100;
      const query = `SELECT campaign.id, campaign.name, campaign.status,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions, metrics.conversions_value,
        metrics.ctr, metrics.average_cpc, metrics.average_cpm,
        segments.date
        FROM campaign
        WHERE ${conditions.join(" AND ")}
        ORDER BY segments.date DESC
        LIMIT ${limit}`;
      return gaqlSearch(client, cid, query, h);
    },
  },

  {
    name: "google_ads_get_keyword_performance",
    description: "Get keyword performance metrics for a date range",
    schema: s.getKeywordPerformanceSchema,
    execute: async (a, client) => {
      const cid = (a.customer_id as string).replace(/-/g, "");
      const h = buildHeaders(client, a.login_customer_id as string | undefined);
      const conditions = [
        "ad_group_criterion.type = 'KEYWORD'",
        `segments.date >= '${a.date_from}'`,
        `segments.date <= '${a.date_to}'`,
      ];
      if (a.campaign_id)
        conditions.push(`campaign.id = ${a.campaign_id}`);
      if (a.ad_group_id)
        conditions.push(`ad_group.id = ${a.ad_group_id}`);
      const limit = (a.limit as number | undefined) ?? 100;
      const query = `SELECT ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        campaign.name, ad_group.name,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions, metrics.ctr, metrics.average_cpc,
        metrics.quality_score,
        segments.date
        FROM keyword_view
        WHERE ${conditions.join(" AND ")}
        ORDER BY metrics.impressions DESC
        LIMIT ${limit}`;
      return gaqlSearch(client, cid, query, h);
    },
  },
];
