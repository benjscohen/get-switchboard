import { z } from "zod";
import { jsonParam, jsonParamOptional } from "../shared/json-params";

// ── Shared fragments ──

export const customerId = z
  .string()
  .describe("Google Ads customer ID (digits only, no dashes)");

export const loginCustomerId = z
  .string()
  .optional()
  .describe(
    "Manager account (MCC) customer ID, required when accessing accounts through a manager"
  );

export const resourceName = z
  .string()
  .describe("Full resource name (e.g. customers/123/campaigns/456)");

// ── 1. Account ──

export const listAccessibleCustomersSchema = z.object({});

export const getCustomerSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
});

// ── 2. Campaigns ──

export const searchCampaignsSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  status: z
    .enum(["ENABLED", "PAUSED", "REMOVED"])
    .optional()
    .describe("Filter by campaign status"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .optional()
    .describe("Max rows to return (default 100)"),
});

export const getCampaignSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  resource_name: resourceName,
});

export const createCampaignSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  name: z.string().describe("Campaign name"),
  advertising_channel_type: z
    .enum(["SEARCH", "DISPLAY", "SHOPPING", "VIDEO", "MULTI_CHANNEL"])
    .describe("Campaign channel type"),
  status: z
    .enum(["ENABLED", "PAUSED"])
    .optional()
    .describe("Initial campaign status (default PAUSED)"),
  budget_resource_name: z
    .string()
    .describe("Resource name of the campaign budget to use"),
  bidding_strategy_type: z
    .enum([
      "TARGET_CPA",
      "TARGET_ROAS",
      "MAXIMIZE_CONVERSIONS",
      "MAXIMIZE_CONVERSION_VALUE",
      "MANUAL_CPC",
      "MANUAL_CPM",
    ])
    .optional()
    .describe("Bidding strategy type"),
  target_cpa_micros: z
    .number()
    .optional()
    .describe("Target CPA in micros (for TARGET_CPA)"),
  target_roas: z
    .number()
    .optional()
    .describe("Target ROAS (for TARGET_ROAS, e.g. 3.5 = 350%)"),
  network_settings: jsonParamOptional(
    "Network settings object, e.g. {\"targetGoogleSearch\":true,\"targetSearchNetwork\":true}"
  ),
});

export const updateCampaignSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  resource_name: resourceName,
  name: z.string().optional().describe("New campaign name"),
  status: z
    .enum(["ENABLED", "PAUSED", "REMOVED"])
    .optional()
    .describe("New campaign status"),
  budget_resource_name: z
    .string()
    .optional()
    .describe("New budget resource name"),
  target_cpa_micros: z.number().optional().describe("New target CPA in micros"),
  target_roas: z.number().optional().describe("New target ROAS"),
});

export const removeCampaignSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  resource_name: resourceName,
});

// ── 3. Ad Groups ──

export const searchAdGroupsSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  campaign_resource_name: z
    .string()
    .optional()
    .describe("Filter by campaign resource name"),
  status: z
    .enum(["ENABLED", "PAUSED", "REMOVED"])
    .optional()
    .describe("Filter by ad group status"),
  limit: z.number().int().min(1).max(10000).optional().describe("Max rows"),
});

export const createAdGroupSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  campaign_resource_name: z
    .string()
    .describe("Campaign resource name to add the ad group to"),
  name: z.string().describe("Ad group name"),
  type: z
    .enum([
      "SEARCH_STANDARD",
      "DISPLAY_STANDARD",
      "SHOPPING_PRODUCT_ADS",
      "VIDEO_TRUE_VIEW_IN_STREAM",
    ])
    .optional()
    .describe("Ad group type"),
  status: z
    .enum(["ENABLED", "PAUSED"])
    .optional()
    .describe("Initial status (default ENABLED)"),
  cpc_bid_micros: z
    .number()
    .optional()
    .describe("Default CPC bid in micros"),
});

export const updateAdGroupSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  resource_name: resourceName,
  name: z.string().optional().describe("New ad group name"),
  status: z
    .enum(["ENABLED", "PAUSED", "REMOVED"])
    .optional()
    .describe("New status"),
  cpc_bid_micros: z.number().optional().describe("New CPC bid in micros"),
});

export const removeAdGroupSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  resource_name: resourceName,
});

// ── 4. Ads ──

export const searchAdsSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  ad_group_resource_name: z
    .string()
    .optional()
    .describe("Filter by ad group resource name"),
  status: z
    .enum(["ENABLED", "PAUSED", "REMOVED"])
    .optional()
    .describe("Filter by ad status"),
  limit: z.number().int().min(1).max(10000).optional().describe("Max rows"),
});

export const createResponsiveSearchAdSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  ad_group_resource_name: z
    .string()
    .describe("Ad group resource name"),
  headlines: jsonParam(
    "Array of headline objects, e.g. [{\"text\":\"Buy Now\"},{\"text\":\"Free Shipping\"}]. Min 3, max 15."
  ),
  descriptions: jsonParam(
    "Array of description objects, e.g. [{\"text\":\"Great deals await.\"}]. Min 2, max 4."
  ),
  final_urls: jsonParam(
    "Array of final URL strings, e.g. [\"https://example.com\"]"
  ),
  path1: z
    .string()
    .optional()
    .describe("First part of display URL path (max 15 chars)"),
  path2: z
    .string()
    .optional()
    .describe("Second part of display URL path (max 15 chars)"),
  status: z
    .enum(["ENABLED", "PAUSED"])
    .optional()
    .describe("Initial ad status (default ENABLED)"),
});

export const updateAdSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  ad_group_resource_name: z
    .string()
    .describe("Ad group resource name containing the ad"),
  ad_id: z.string().describe("Ad ID"),
  status: z
    .enum(["ENABLED", "PAUSED", "REMOVED"])
    .optional()
    .describe("New ad status"),
});

export const removeAdSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  ad_group_resource_name: z
    .string()
    .describe("Ad group resource name containing the ad"),
  ad_id: z.string().describe("Ad ID to remove"),
});

// ── 5. Keywords ──

export const searchKeywordsSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  ad_group_resource_name: z
    .string()
    .optional()
    .describe("Filter by ad group resource name"),
  status: z
    .enum(["ENABLED", "PAUSED", "REMOVED"])
    .optional()
    .describe("Filter by keyword status"),
  limit: z.number().int().min(1).max(10000).optional().describe("Max rows"),
});

export const addKeywordsSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  ad_group_resource_name: z.string().describe("Ad group resource name"),
  keywords: jsonParam(
    'Array of keyword objects, e.g. [{"text":"running shoes","matchType":"BROAD","cpcBidMicros":1500000}]'
  ),
});

export const updateKeywordSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  resource_name: z
    .string()
    .describe("Keyword criterion resource name"),
  status: z
    .enum(["ENABLED", "PAUSED", "REMOVED"])
    .optional()
    .describe("New status"),
  cpc_bid_micros: z.number().optional().describe("New CPC bid in micros"),
});

export const removeKeywordSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  resource_name: z.string().describe("Keyword criterion resource name"),
});

// ── 6. Budgets ──

export const searchBudgetsSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  limit: z.number().int().min(1).max(10000).optional().describe("Max rows"),
});

export const createBudgetSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  name: z.string().describe("Budget name"),
  amount_micros: z
    .number()
    .describe("Daily budget amount in micros (e.g. 10000000 = $10)"),
  delivery_method: z
    .enum(["STANDARD", "ACCELERATED"])
    .optional()
    .describe("Budget delivery method (default STANDARD)"),
  explicitly_shared: z
    .boolean()
    .optional()
    .describe("Whether budget is shared across campaigns"),
});

export const updateBudgetSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  resource_name: resourceName,
  name: z.string().optional().describe("New budget name"),
  amount_micros: z.number().optional().describe("New daily budget in micros"),
});

// ── 7. Reporting / GAQL ──

export const querySchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  query: z
    .string()
    .describe(
      "GAQL query string, e.g. SELECT campaign.id, campaign.name FROM campaign"
    ),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .optional()
    .describe("Results per page (default 1000)"),
  page_token: z
    .string()
    .optional()
    .describe("Page token for pagination"),
});

export const getCampaignPerformanceSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  date_from: z
    .string()
    .describe("Start date in YYYY-MM-DD format"),
  date_to: z
    .string()
    .describe("End date in YYYY-MM-DD format"),
  campaign_id: z
    .string()
    .optional()
    .describe("Filter by specific campaign ID"),
  limit: z.number().int().min(1).max(10000).optional().describe("Max rows"),
});

export const getKeywordPerformanceSchema = z.object({
  customer_id: customerId,
  login_customer_id: loginCustomerId,
  date_from: z.string().describe("Start date in YYYY-MM-DD format"),
  date_to: z.string().describe("End date in YYYY-MM-DD format"),
  campaign_id: z
    .string()
    .optional()
    .describe("Filter by specific campaign ID"),
  ad_group_id: z
    .string()
    .optional()
    .describe("Filter by specific ad group ID"),
  limit: z.number().int().min(1).max(10000).optional().describe("Max rows"),
});
