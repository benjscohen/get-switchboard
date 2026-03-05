import { z } from "zod";

// ── Shared fragments ──

export const adAccountId = z
  .string()
  .describe("LinkedIn ad account ID (numeric, e.g. 512345678)");

export const campaignGroupId = z
  .string()
  .describe("LinkedIn campaign group ID");

export const campaignId = z.string().describe("LinkedIn campaign ID");

export const creativeId = z.string().describe("LinkedIn creative ID");

export const pageSize = z
  .number()
  .int()
  .min(1)
  .max(1000)
  .optional()
  .describe("Number of results per page (default 25, max 1000)");

export const pageToken = z
  .string()
  .optional()
  .describe("Page token for cursor-based pagination");

export const dateRange = z.object({
  start_year: z.number().int().describe("Start year (e.g. 2025)"),
  start_month: z.number().int().min(1).max(12).describe("Start month (1-12)"),
  start_day: z.number().int().min(1).max(31).describe("Start day (1-31)"),
  end_year: z.number().int().describe("End year (e.g. 2025)"),
  end_month: z.number().int().min(1).max(12).describe("End month (1-12)"),
  end_day: z.number().int().min(1).max(31).describe("End day (1-31)"),
});

// ── 1. Ad Accounts ──

export const searchAccountsSchema = z.object({
  page_size: pageSize,
  page_token: pageToken,
});

export const getAccountSchema = z.object({
  ad_account_id: adAccountId,
});

export const updateAccountSchema = z.object({
  ad_account_id: adAccountId,
  name: z.string().optional().describe("New account name"),
  notification_emails: z
    .array(z.string())
    .optional()
    .describe("Notification email addresses"),
});

// ── 2. Campaign Groups ──

export const searchCampaignGroupsSchema = z.object({
  ad_account_id: adAccountId,
  status: z
    .enum(["ACTIVE", "PAUSED", "ARCHIVED", "CANCELED", "DRAFT"])
    .optional()
    .describe("Filter by campaign group status"),
  name: z.string().optional().describe("Filter by name (substring match)"),
  page_size: pageSize,
  page_token: pageToken,
});

export const getCampaignGroupSchema = z.object({
  ad_account_id: adAccountId,
  campaign_group_id: campaignGroupId,
});

export const createCampaignGroupSchema = z.object({
  ad_account_id: adAccountId,
  name: z.string().describe("Campaign group name"),
  status: z
    .enum(["ACTIVE", "PAUSED", "DRAFT"])
    .optional()
    .describe("Initial status (default DRAFT)"),
  total_budget_amount: z
    .number()
    .optional()
    .describe("Total budget in account currency cents"),
  daily_budget_amount: z
    .number()
    .optional()
    .describe("Daily budget in account currency cents"),
  start_date: z
    .string()
    .optional()
    .describe("Start date in YYYY-MM-DD format"),
  end_date: z
    .string()
    .optional()
    .describe("End date in YYYY-MM-DD format"),
});

export const updateCampaignGroupSchema = z.object({
  ad_account_id: adAccountId,
  campaign_group_id: campaignGroupId,
  name: z.string().optional().describe("New campaign group name"),
  status: z
    .enum(["ACTIVE", "PAUSED", "ARCHIVED", "CANCELED", "DRAFT"])
    .optional()
    .describe("New status"),
  total_budget_amount: z
    .number()
    .optional()
    .describe("New total budget in account currency cents"),
  daily_budget_amount: z
    .number()
    .optional()
    .describe("New daily budget in account currency cents"),
  start_date: z
    .string()
    .optional()
    .describe("New start date in YYYY-MM-DD format"),
  end_date: z
    .string()
    .optional()
    .describe("New end date in YYYY-MM-DD format"),
});

// ── 3. Campaigns ──

export const searchCampaignsSchema = z.object({
  ad_account_id: adAccountId,
  campaign_group_id: z
    .string()
    .optional()
    .describe("Filter by campaign group ID"),
  status: z
    .enum(["ACTIVE", "PAUSED", "ARCHIVED", "CANCELED", "DRAFT"])
    .optional()
    .describe("Filter by campaign status"),
  name: z.string().optional().describe("Filter by name (substring match)"),
  page_size: pageSize,
  page_token: pageToken,
});

export const getCampaignSchema = z.object({
  ad_account_id: adAccountId,
  campaign_id: campaignId,
});

export const createCampaignSchema = z.object({
  ad_account_id: adAccountId,
  campaign_group_id: campaignGroupId,
  name: z.string().describe("Campaign name"),
  status: z
    .enum(["ACTIVE", "PAUSED", "DRAFT"])
    .optional()
    .describe("Initial status (default DRAFT)"),
  type: z
    .enum(["TEXT_AD", "SPONSORED_UPDATES", "SPONSORED_INMAILS", "DYNAMIC"])
    .describe("Campaign type / ad format"),
  objective_type: z
    .enum([
      "BRAND_AWARENESS",
      "WEBSITE_VISITS",
      "ENGAGEMENT",
      "VIDEO_VIEWS",
      "LEAD_GENERATION",
      "WEBSITE_CONVERSIONS",
      "JOB_APPLICANTS",
      "TALENT_LEADS",
    ])
    .optional()
    .describe("Campaign objective"),
  daily_budget_amount: z
    .number()
    .describe("Daily budget in account currency cents"),
  cost_type: z
    .enum(["CPM", "CPC", "CPV"])
    .optional()
    .describe("Cost type (default CPC)"),
  bid_amount: z
    .number()
    .optional()
    .describe("Bid amount in account currency cents"),
  targeting_criteria: z
    .string()
    .optional()
    .describe(
      "JSON string of targeting criteria, e.g. {\"include\":{\"and\":[{\"or\":{\"urn:li:adTargetingFacet:locations\":[\"urn:li:geo:103644278\"]}}]}}"
    ),
  creative_selection: z
    .enum(["ROUND_ROBIN", "OPTIMIZED"])
    .optional()
    .describe("Creative selection strategy (default OPTIMIZED)"),
});

export const updateCampaignSchema = z.object({
  ad_account_id: adAccountId,
  campaign_id: campaignId,
  name: z.string().optional().describe("New campaign name"),
  status: z
    .enum(["ACTIVE", "PAUSED", "ARCHIVED", "CANCELED", "DRAFT"])
    .optional()
    .describe("New status"),
  daily_budget_amount: z
    .number()
    .optional()
    .describe("New daily budget in account currency cents"),
  bid_amount: z
    .number()
    .optional()
    .describe("New bid amount in account currency cents"),
  targeting_criteria: z
    .string()
    .optional()
    .describe("New targeting criteria as JSON string"),
});

// ── 4. Creatives ──

export const searchCreativesSchema = z.object({
  ad_account_id: adAccountId,
  campaign_id: z.string().optional().describe("Filter by campaign ID"),
  status: z
    .enum(["ACTIVE", "PAUSED", "DRAFT", "ARCHIVED", "CANCELED"])
    .optional()
    .describe("Filter by creative status"),
  page_size: pageSize,
  page_token: pageToken,
});

export const getCreativeSchema = z.object({
  ad_account_id: adAccountId,
  creative_id: creativeId,
});

export const createCreativeSchema = z.object({
  ad_account_id: adAccountId,
  campaign_id: campaignId,
  content: z
    .string()
    .describe(
      "JSON string of creative content (varies by type, e.g. {\"article\":{\"source\":\"https://example.com\",\"title\":\"Ad Title\",\"description\":\"Ad Description\"}})"
    ),
  intended_status: z
    .enum(["ACTIVE", "PAUSED", "DRAFT"])
    .optional()
    .describe("Initial creative status (default DRAFT)"),
});

export const updateCreativeSchema = z.object({
  ad_account_id: adAccountId,
  creative_id: creativeId,
  intended_status: z
    .enum(["ACTIVE", "PAUSED", "ARCHIVED"])
    .optional()
    .describe("New creative status"),
});

// ── 5. Ad Account Users ──

export const searchAccountUsersSchema = z.object({
  ad_account_id: adAccountId,
  page_size: pageSize,
  page_token: pageToken,
});

export const createAccountUserSchema = z.object({
  ad_account_id: adAccountId,
  user_person_id: z
    .string()
    .describe("LinkedIn person URN ID of the user to grant access"),
  role: z
    .enum([
      "ACCOUNT_BILLING_ADMIN",
      "ACCOUNT_MANAGER",
      "CAMPAIGN_MANAGER",
      "CREATIVE_MANAGER",
      "VIEWER",
    ])
    .describe("Role to assign to the user"),
});

export const removeAccountUserSchema = z.object({
  ad_account_id: adAccountId,
  user_person_id: z
    .string()
    .describe("LinkedIn person URN ID of the user to remove"),
});

// ── 6. Targeting ──

export const getTargetingFacetsSchema = z.object({
  ad_account_id: adAccountId,
});

export const searchTargetingEntitiesSchema = z.object({
  ad_account_id: adAccountId,
  facet_urn: z
    .string()
    .describe(
      "Targeting facet URN (e.g. urn:li:adTargetingFacet:locations)"
    ),
  query: z.string().describe("Typeahead search query"),
  page_size: pageSize,
});

export const getTargetingEntitiesSchema = z.object({
  ad_account_id: adAccountId,
  facet_urn: z
    .string()
    .describe("Targeting facet URN"),
  entity_urns: z
    .array(z.string())
    .describe("Array of entity URNs to retrieve"),
});

// ── 7. Analytics / Reporting ──

export const getCampaignAnalyticsSchema = z.object({
  ad_account_id: adAccountId,
  campaign_ids: z
    .array(z.string())
    .describe("Campaign IDs to get analytics for"),
  date_range: dateRange,
  time_granularity: z
    .enum(["DAILY", "MONTHLY", "ALL"])
    .optional()
    .describe("Time granularity (default ALL)"),
});

export const getCreativeAnalyticsSchema = z.object({
  ad_account_id: adAccountId,
  creative_ids: z
    .array(z.string())
    .describe("Creative IDs to get analytics for"),
  date_range: dateRange,
  time_granularity: z
    .enum(["DAILY", "MONTHLY", "ALL"])
    .optional()
    .describe("Time granularity (default ALL)"),
});

export const getAccountAnalyticsSchema = z.object({
  ad_account_id: adAccountId,
  date_range: dateRange,
  time_granularity: z
    .enum(["DAILY", "MONTHLY", "ALL"])
    .optional()
    .describe("Time granularity (default ALL)"),
});

// ── 8. Conversions ──

export const searchConversionsSchema = z.object({
  ad_account_id: adAccountId,
  page_size: pageSize,
  page_token: pageToken,
});

export const createConversionSchema = z.object({
  ad_account_id: adAccountId,
  name: z.string().describe("Conversion rule name"),
  type: z
    .enum(["LEAD", "ADD_TO_CART", "INSTALL", "KEY_PAGE_VIEW", "PURCHASE", "SIGN_UP", "OTHER"])
    .describe("Conversion type"),
  attribution_type: z
    .enum(["LAST_TOUCH_BY_CAMPAIGN", "LAST_TOUCH_BY_CONVERSION"])
    .optional()
    .describe("Attribution model (default LAST_TOUCH_BY_CAMPAIGN)"),
  post_click_attribution_window_size: z
    .number()
    .int()
    .optional()
    .describe("Post-click attribution window in days (default 30)"),
  view_through_attribution_window_size: z
    .number()
    .int()
    .optional()
    .describe("View-through attribution window in days (default 7)"),
});

// ── 9. Lead Gen Forms ──

export const searchLeadGenFormsSchema = z.object({
  ad_account_id: adAccountId,
  page_size: pageSize,
  page_token: pageToken,
});

export const getLeadGenFormResponsesSchema = z.object({
  ad_account_id: adAccountId,
  lead_gen_form_id: z.string().describe("Lead gen form ID"),
  page_size: pageSize,
  page_token: pageToken,
});
