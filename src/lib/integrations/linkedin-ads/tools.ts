import type { IntegrationToolDef } from "../types";
import { flexParse } from "../shared/json-params";
import * as s from "./schemas";

// ── Client type ──

export type LinkedInAdsClient = {
  baseUrl: string;
  headers: Record<string, string>;
};

// ── Helpers ──

async function linkedinGet(
  client: LinkedInAdsClient,
  path: string,
  params?: Record<string, string>,
  extraHeaders?: Record<string, string>
): Promise<unknown> {
  // Build query string manually to preserve REST.li special characters
  // (parentheses, colons, commas) that URL.searchParams would percent-encode
  let url = `${client.baseUrl}${path}`;
  if (params) {
    const parts = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${v}`);
    if (parts.length > 0) {
      url += (url.includes("?") ? "&" : "?") + parts.join("&");
    }
  }
  const res = await fetch(url, {
    method: "GET",
    headers: { ...client.headers, ...extraHeaders },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn API ${res.status}: ${text}`);
  }
  return res.json();
}

async function linkedinPut(
  client: LinkedInAdsClient,
  path: string,
  body: unknown
): Promise<unknown> {
  const res = await fetch(`${client.baseUrl}${path}`, {
    method: "PUT",
    headers: client.headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn API ${res.status}: ${text}`);
  }
  if (res.status === 204) return { success: true };
  return res.json();
}

async function linkedinPost(
  client: LinkedInAdsClient,
  path: string,
  body: unknown
): Promise<unknown> {
  const res = await fetch(`${client.baseUrl}${path}`, {
    method: "POST",
    headers: client.headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn API ${res.status}: ${text}`);
  }
  if (res.status === 204) return { success: true };
  return res.json();
}

async function linkedinPartialUpdate(
  client: LinkedInAdsClient,
  path: string,
  fields: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(`${client.baseUrl}${path}`, {
    method: "POST",
    headers: {
      ...client.headers,
      "X-Restli-Method": "PARTIAL_UPDATE",
    },
    body: JSON.stringify({ patch: { $set: fields } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn API ${res.status}: ${text}`);
  }
  if (res.status === 204) return { success: true };
  return res.json();
}

async function linkedinDelete(
  client: LinkedInAdsClient,
  path: string
): Promise<unknown> {
  const res = await fetch(`${client.baseUrl}${path}`, {
    method: "DELETE",
    headers: client.headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn API ${res.status}: ${text}`);
  }
  return { success: true };
}

function buildSearchParams(search: Record<string, string[]>): string {
  const parts = Object.entries(search)
    .filter(([, values]) => values.length > 0)
    .map(([key, values]) => `${key}:(values:List(${values.join(",")}))`);
  if (parts.length === 0) return "";
  return `search=(${parts.join(",")})`;
}

function buildPaginationParams(
  pageSize?: number,
  pageToken?: string
): Record<string, string> {
  const params: Record<string, string> = {};
  if (pageSize) params.pageSize = String(pageSize);
  if (pageToken) params.pageToken = pageToken;
  return params;
}

function dateRangeParam(dr: {
  start_year: number;
  start_month: number;
  start_day: number;
  end_year: number;
  end_month: number;
  end_day: number;
}): string {
  return `dateRange=(start:(year:${dr.start_year},month:${dr.start_month},day:${dr.start_day}),end:(year:${dr.end_year},month:${dr.end_month},day:${dr.end_day}))`;
}

// ── Typed tool def ──

type LinkedInAdsToolDef = Omit<IntegrationToolDef, "execute"> & {
  execute: (
    args: Record<string, unknown>,
    client: LinkedInAdsClient
  ) => Promise<unknown>;
};

// ── Tool implementations ──

export const LINKEDIN_ADS_TOOLS: LinkedInAdsToolDef[] = [
  // ═══════════════════════════════════════════
  // Ad Accounts (3)
  // ═══════════════════════════════════════════

  {
    name: "linkedin_ads_search_accounts",
    description:
      "Search and list LinkedIn ad accounts accessible to the authenticated user",
    schema: s.searchAccountsSchema,
    execute: async (args, client) => {
      return linkedinGet(
        client,
        "/adAccounts",
        {
          q: "search",
          ...buildPaginationParams(
            args.page_size as number | undefined,
            args.page_token as string | undefined
          ),
        }
      );
    },
  },

  {
    name: "linkedin_ads_get_account",
    description: "Get a single LinkedIn ad account by ID",
    schema: s.getAccountSchema,
    execute: async (args, client) => {
      return linkedinGet(client, `/adAccounts/${args.ad_account_id}`);
    },
  },

  {
    name: "linkedin_ads_update_account",
    description: "Update LinkedIn ad account settings (name, notifications)",
    schema: s.updateAccountSchema,
    execute: async (args, client) => {
      const fields: Record<string, unknown> = {};
      if (args.name) fields.name = args.name;
      if (args.notification_emails)
        fields.notificationEmails = args.notification_emails;
      return linkedinPartialUpdate(
        client,
        `/adAccounts/${args.ad_account_id}`,
        fields
      );
    },
  },

  // ═══════════════════════════════════════════
  // Campaign Groups (4)
  // ═══════════════════════════════════════════

  {
    name: "linkedin_ads_search_campaign_groups",
    description:
      "Search LinkedIn campaign groups with optional status and name filters",
    schema: s.searchCampaignGroupsSchema,
    execute: async (args, client) => {
      const search: Record<string, string[]> = {};
      if (args.status) search.status = [args.status as string];
      if (args.name) search.name = [args.name as string];
      const searchStr = buildSearchParams(search);
      const params: Record<string, string> = {
        q: "search",
        ...buildPaginationParams(
          args.page_size as number | undefined,
          args.page_token as string | undefined
        ),
      };
      const path = `/adAccounts/${args.ad_account_id}/adCampaignGroups${searchStr ? `?${searchStr}` : ""}`;
      return linkedinGet(client, path, params);
    },
  },

  {
    name: "linkedin_ads_get_campaign_group",
    description: "Get a single LinkedIn campaign group by ID",
    schema: s.getCampaignGroupSchema,
    execute: async (args, client) => {
      return linkedinGet(
        client,
        `/adAccounts/${args.ad_account_id}/adCampaignGroups/${args.campaign_group_id}`
      );
    },
  },

  {
    name: "linkedin_ads_create_campaign_group",
    description:
      "Create a LinkedIn campaign group with name, budget, and schedule",
    schema: s.createCampaignGroupSchema,
    execute: async (args, client) => {
      const body: Record<string, unknown> = {
        account: `urn:li:sponsoredAccount:${args.ad_account_id}`,
        name: args.name,
        status: args.status || "DRAFT",
      };
      if (args.total_budget_amount != null) {
        body.totalBudget = {
          amount: String(args.total_budget_amount),
          currencyCode: "USD",
        };
      }
      if (args.daily_budget_amount != null) {
        body.dailyBudget = {
          amount: String(args.daily_budget_amount),
          currencyCode: "USD",
        };
      }
      if (args.start_date) {
        const [y, m, d] = (args.start_date as string).split("-");
        body.runSchedule = {
          ...(body.runSchedule as Record<string, unknown> | undefined),
          start: { year: Number(y), month: Number(m), day: Number(d) },
        };
      }
      if (args.end_date) {
        const [y, m, d] = (args.end_date as string).split("-");
        body.runSchedule = {
          ...(body.runSchedule as Record<string, unknown> | undefined),
          end: { year: Number(y), month: Number(m), day: Number(d) },
        };
      }
      return linkedinPost(client, "/adCampaignGroups", body);
    },
  },

  {
    name: "linkedin_ads_update_campaign_group",
    description:
      "Update a LinkedIn campaign group (name, status, budget, schedule)",
    schema: s.updateCampaignGroupSchema,
    execute: async (args, client) => {
      const fields: Record<string, unknown> = {};
      if (args.name) fields.name = args.name;
      if (args.status) fields.status = args.status;
      if (args.total_budget_amount != null) {
        fields.totalBudget = {
          amount: String(args.total_budget_amount),
          currencyCode: "USD",
        };
      }
      if (args.daily_budget_amount != null) {
        fields.dailyBudget = {
          amount: String(args.daily_budget_amount),
          currencyCode: "USD",
        };
      }
      if (args.start_date) {
        const [y, m, d] = (args.start_date as string).split("-");
        fields["runSchedule.start"] = {
          year: Number(y),
          month: Number(m),
          day: Number(d),
        };
      }
      if (args.end_date) {
        const [y, m, d] = (args.end_date as string).split("-");
        fields["runSchedule.end"] = {
          year: Number(y),
          month: Number(m),
          day: Number(d),
        };
      }
      return linkedinPartialUpdate(
        client,
        `/adCampaignGroups/${args.campaign_group_id}`,
        fields
      );
    },
  },

  // ═══════════════════════════════════════════
  // Campaigns (4)
  // ═══════════════════════════════════════════

  {
    name: "linkedin_ads_search_campaigns",
    description:
      "Search LinkedIn campaigns with optional status, type, and name filters",
    schema: s.searchCampaignsSchema,
    execute: async (args, client) => {
      const search: Record<string, string[]> = {};
      if (args.status) search.status = [args.status as string];
      if (args.name) search.name = [args.name as string];
      if (args.campaign_group_id) {
        search.campaignGroup = [
          `urn:li:sponsoredCampaignGroup:${args.campaign_group_id}`,
        ];
      }
      const searchStr = buildSearchParams(search);
      const params: Record<string, string> = {
        q: "search",
        ...buildPaginationParams(
          args.page_size as number | undefined,
          args.page_token as string | undefined
        ),
      };
      const path = `/adAccounts/${args.ad_account_id}/adCampaigns${searchStr ? `?${searchStr}` : ""}`;
      return linkedinGet(client, path, params);
    },
  },

  {
    name: "linkedin_ads_get_campaign",
    description: "Get a single LinkedIn campaign by ID",
    schema: s.getCampaignSchema,
    execute: async (args, client) => {
      return linkedinGet(
        client,
        `/adAccounts/${args.ad_account_id}/adCampaigns/${args.campaign_id}`
      );
    },
  },

  {
    name: "linkedin_ads_create_campaign",
    description:
      "Create a LinkedIn campaign with targeting, budget, bidding, and format settings",
    schema: s.createCampaignSchema,
    execute: async (args, client) => {
      const body: Record<string, unknown> = {
        account: `urn:li:sponsoredAccount:${args.ad_account_id}`,
        campaignGroup: `urn:li:sponsoredCampaignGroup:${args.campaign_group_id}`,
        name: args.name,
        status: args.status || "DRAFT",
        type: args.type,
        dailyBudget: {
          amount: String(args.daily_budget_amount),
          currencyCode: "USD",
        },
      };
      if (args.objective_type) body.objectiveType = args.objective_type;
      if (args.cost_type) body.costType = args.cost_type;
      if (args.bid_amount != null) {
        body.unitCost = {
          amount: String(args.bid_amount),
          currencyCode: "USD",
        };
      }
      if (args.targeting_criteria) {
        body.targetingCriteria = flexParse(args.targeting_criteria as string);
      }
      if (args.creative_selection)
        body.creativeSelection = args.creative_selection;
      return linkedinPost(client, "/adCampaigns", body);
    },
  },

  {
    name: "linkedin_ads_update_campaign",
    description:
      "Update a LinkedIn campaign (status, budget, bid, targeting)",
    schema: s.updateCampaignSchema,
    execute: async (args, client) => {
      const fields: Record<string, unknown> = {};
      if (args.name) fields.name = args.name;
      if (args.status) fields.status = args.status;
      if (args.daily_budget_amount != null) {
        fields.dailyBudget = {
          amount: String(args.daily_budget_amount),
          currencyCode: "USD",
        };
      }
      if (args.bid_amount != null) {
        fields.unitCost = {
          amount: String(args.bid_amount),
          currencyCode: "USD",
        };
      }
      if (args.targeting_criteria) {
        fields.targetingCriteria = flexParse(
          args.targeting_criteria as string
        );
      }
      return linkedinPartialUpdate(
        client,
        `/adCampaigns/${args.campaign_id}`,
        fields
      );
    },
  },

  // ═══════════════════════════════════════════
  // Creatives (4)
  // ═══════════════════════════════════════════

  {
    name: "linkedin_ads_search_creatives",
    description: "Search LinkedIn creatives with optional status filters",
    schema: s.searchCreativesSchema,
    execute: async (args, client) => {
      const params: Record<string, string> = {
        q: "criteria",
        ...buildPaginationParams(
          args.page_size as number | undefined,
          args.page_token as string | undefined
        ),
      };
      if (args.status) params.intendedStatuses = `List(${args.status})`;
      if (args.campaign_id)
        params.campaigns = `List(urn:li:sponsoredCampaign:${args.campaign_id})`;
      return linkedinGet(
        client,
        `/adAccounts/${args.ad_account_id}/creatives`,
        params,
        { "X-RestLi-Method": "FINDER" }
      );
    },
  },

  {
    name: "linkedin_ads_get_creative",
    description: "Get a single LinkedIn creative by ID",
    schema: s.getCreativeSchema,
    execute: async (args, client) => {
      const creativeId = String(args.creative_id);
      const creativeKey = creativeId.startsWith("urn:")
        ? encodeURIComponent(creativeId)
        : `urn%3Ali%3AsponsoredCreative%3A${creativeId}`;
      return linkedinGet(
        client,
        `/adAccounts/${args.ad_account_id}/creatives/${creativeKey}`
      );
    },
  },

  {
    name: "linkedin_ads_create_creative",
    description:
      "Create a LinkedIn creative (sponsored content, text ad, etc.)",
    schema: s.createCreativeSchema,
    execute: async (args, client) => {
      const body: Record<string, unknown> = {
        account: `urn:li:sponsoredAccount:${args.ad_account_id}`,
        campaign: `urn:li:sponsoredCampaign:${args.campaign_id}`,
        content: flexParse(args.content as string),
        intendedStatus: args.intended_status || "DRAFT",
      };
      return linkedinPost(
        client,
        `/adAccounts/${args.ad_account_id}/creatives`,
        body
      );
    },
  },

  {
    name: "linkedin_ads_update_creative",
    description: "Update a LinkedIn creative status",
    schema: s.updateCreativeSchema,
    execute: async (args, client) => {
      const fields: Record<string, unknown> = {};
      if (args.intended_status)
        fields.intendedStatus = args.intended_status;
      return linkedinPartialUpdate(
        client,
        `/adAccounts/${args.ad_account_id}/creatives/${args.creative_id}`,
        fields
      );
    },
  },

  // ═══════════════════════════════════════════
  // Ad Account Users (3)
  // ═══════════════════════════════════════════

  {
    name: "linkedin_ads_search_account_users",
    description: "List users with access to a LinkedIn ad account",
    schema: s.searchAccountUsersSchema,
    execute: async (args, client) => {
      return linkedinGet(client, "/adAccountUsers", {
        q: "accounts",
        accounts: `urn:li:sponsoredAccount:${args.ad_account_id}`,
        ...buildPaginationParams(
          args.page_size as number | undefined,
          args.page_token as string | undefined
        ),
      });
    },
  },

  {
    name: "linkedin_ads_create_account_user",
    description: "Grant a user access to a LinkedIn ad account",
    schema: s.createAccountUserSchema,
    execute: async (args, client) => {
      const key = `(account:urn:li:sponsoredAccount:${args.ad_account_id},user:urn:li:person:${args.user_person_id})`;
      return linkedinPut(client, `/adAccountUsers/${key}`, {
        account: `urn:li:sponsoredAccount:${args.ad_account_id}`,
        user: `urn:li:person:${args.user_person_id}`,
        role: args.role,
      });
    },
  },

  {
    name: "linkedin_ads_remove_account_user",
    description: "Revoke a user's access to a LinkedIn ad account",
    schema: s.removeAccountUserSchema,
    execute: async (args, client) => {
      const key = `(account:urn:li:sponsoredAccount:${args.ad_account_id},user:urn:li:person:${args.user_person_id})`;
      return linkedinDelete(client, `/adAccountUsers/${key}`);
    },
  },

  // ═══════════════════════════════════════════
  // Targeting (3)
  // ═══════════════════════════════════════════

  {
    name: "linkedin_ads_get_targeting_facets",
    description: "List available LinkedIn targeting facets for an ad account",
    schema: s.getTargetingFacetsSchema,
    execute: async (_args, client) => {
      return linkedinGet(client, "/adTargetingFacets");
    },
  },

  {
    name: "linkedin_ads_search_targeting_entities",
    description:
      "Search LinkedIn targeting entities by facet (typeahead lookup)",
    schema: s.searchTargetingEntitiesSchema,
    execute: async (args, client) => {
      return linkedinGet(client, "/adTargetingEntities", {
        q: "adTargetingFacet",
        queryVersion: "QUERY_USES_URNS",
        facet: args.facet_urn as string,
        ...(args.query ? { queryTerm: args.query as string } : {}),
        ...(args.page_size
          ? { pageSize: String(args.page_size) }
          : {}),
      });
    },
  },

  // ═══════════════════════════════════════════
  // Analytics / Reporting (3)
  // ═══════════════════════════════════════════

  {
    name: "linkedin_ads_get_campaign_analytics",
    description:
      "Get LinkedIn campaign performance metrics for a date range",
    schema: s.getCampaignAnalyticsSchema,
    execute: async (args, client) => {
      const campaignIds = args.campaign_ids as string[];
      const dr = args.date_range as {
        start_year: number;
        start_month: number;
        start_day: number;
        end_year: number;
        end_month: number;
        end_day: number;
      };
      const campaigns = campaignIds
        .map((id) => `urn:li:sponsoredCampaign:${id}`)
        .join(",");
      const restliParams = [
        dateRangeParam(dr),
        `campaigns=List(${campaigns})`,
        `accounts=List(urn:li:sponsoredAccount:${args.ad_account_id})`,
      ].join("&");
      return linkedinGet(client, `/adAnalytics?${restliParams}`, {
        q: "analytics",
        pivot: "CAMPAIGN",
        timeGranularity: (args.time_granularity as string) || "ALL",
      });
    },
  },

  {
    name: "linkedin_ads_get_creative_analytics",
    description:
      "Get LinkedIn creative performance metrics for a date range",
    schema: s.getCreativeAnalyticsSchema,
    execute: async (args, client) => {
      const creativeIds = args.creative_ids as string[];
      const dr = args.date_range as {
        start_year: number;
        start_month: number;
        start_day: number;
        end_year: number;
        end_month: number;
        end_day: number;
      };
      const creatives = creativeIds
        .map((id) => `urn:li:sponsoredCreative:${id}`)
        .join(",");
      const restliParams = [
        dateRangeParam(dr),
        `creatives=List(${creatives})`,
        `accounts=List(urn:li:sponsoredAccount:${args.ad_account_id})`,
      ].join("&");
      return linkedinGet(client, `/adAnalytics?${restliParams}`, {
        q: "analytics",
        pivot: "CREATIVE",
        timeGranularity: (args.time_granularity as string) || "ALL",
      });
    },
  },

  {
    name: "linkedin_ads_get_account_analytics",
    description:
      "Get LinkedIn account-level analytics for a date range",
    schema: s.getAccountAnalyticsSchema,
    execute: async (args, client) => {
      const dr = args.date_range as {
        start_year: number;
        start_month: number;
        start_day: number;
        end_year: number;
        end_month: number;
        end_day: number;
      };
      const restliParams = [
        dateRangeParam(dr),
        `accounts=List(urn:li:sponsoredAccount:${args.ad_account_id})`,
      ].join("&");
      return linkedinGet(client, `/adAnalytics?${restliParams}`, {
        q: "analytics",
        pivot: "ACCOUNT",
        timeGranularity: (args.time_granularity as string) || "ALL",
      });
    },
  },

  // ═══════════════════════════════════════════
  // Conversions (2)
  // ═══════════════════════════════════════════

  {
    name: "linkedin_ads_search_conversions",
    description: "List conversion rules for a LinkedIn ad account",
    schema: s.searchConversionsSchema,
    execute: async (args, client) => {
      return linkedinGet(client, "/conversions", {
        q: "account",
        account: `urn:li:sponsoredAccount:${args.ad_account_id}`,
      });
    },
  },

  {
    name: "linkedin_ads_create_conversion",
    description: "Create a LinkedIn conversion tracking rule",
    schema: s.createConversionSchema,
    execute: async (args, client) => {
      const body: Record<string, unknown> = {
        account: `urn:li:sponsoredAccount:${args.ad_account_id}`,
        name: args.name,
        type: args.type,
      };
      if (args.attribution_type)
        body.attributionType = args.attribution_type;
      if (args.post_click_attribution_window_size != null)
        body.postClickAttributionWindowSize =
          args.post_click_attribution_window_size;
      if (args.view_through_attribution_window_size != null)
        body.viewThroughAttributionWindowSize =
          args.view_through_attribution_window_size;
      return linkedinPost(client, "/conversions", body);
    },
  },

];
