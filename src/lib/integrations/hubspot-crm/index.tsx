import type { IntegrationConfig, IntegrationToolDef } from "../types";
import { HUBSPOT_CRM_TOOLS, type HubSpotCrmClient } from "./tools";

function HubSpotCrmIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <circle cx="9" cy="9" r="9" fill="#FF7A59" />
      <path
        d="M11.7 6.15V5.1a1.05 1.05 0 00.6-.95v-.03a1.05 1.05 0 00-1.05-1.05h-.03a1.05 1.05 0 00-1.05 1.05v.03c0 .42.25.78.6.95v1.05a3.15 3.15 0 00-1.57.7L6.42 4.83a1.18 1.18 0 00.03-.21 1.2 1.2 0 10-1.2 1.2c.17 0 .33-.04.48-.1l2.7 1.95a3.15 3.15 0 00-.33 1.41 3.15 3.15 0 003.15 3.15 3.15 3.15 0 001.58-.43l1.4 1.4a1.2 1.2 0 101.2-1.2 1.17 1.17 0 00-.77.29l-1.4-1.4a3.15 3.15 0 00-1.56-4.44zm-.45 5.1a1.65 1.65 0 110-3.3 1.65 1.65 0 010 3.3z"
        fill="#fff"
      />
    </svg>
  );
}

const tools: IntegrationToolDef[] = HUBSPOT_CRM_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  schema: t.schema,
  execute: (args: Record<string, unknown>, client: unknown) =>
    t.execute(args, client as HubSpotCrmClient),
}));

export const hubspotCrmIntegration: IntegrationConfig = {
  id: "hubspot-crm",
  name: "HubSpot CRM",
  description:
    "Manage contacts, companies, deals, tickets, pipelines, properties, campaigns, sequences, and more in HubSpot CRM",
  icon: HubSpotCrmIcon,
  oauth: {
    authUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    clientIdEnvVar: "HUBSPOT_CLIENT_ID",
    clientSecretEnvVar: "HUBSPOT_CLIENT_SECRET",
    // Required scopes — mark these as "Required" in HubSpot app settings
    scopes: [
      "crm.objects.contacts.read",
      "crm.objects.companies.read",
      "crm.objects.deals.read",
      "crm.objects.owners.read",
    ],
    // Optional scopes — mark as "Optional" in HubSpot app settings
    // Sent via optional_scope param so users can connect even without access to all
    optionalScopes: [
      "crm.objects.contacts.write",
      "crm.objects.companies.write",
      "crm.objects.deals.write",
      "crm.objects.custom.read",
      "crm.objects.custom.write",
      "crm.objects.leads.read",
      "crm.objects.leads.write",
      "crm.objects.line_items.read",
      "crm.objects.line_items.write",
      "crm.objects.products.read",
      "crm.objects.products.write",
      "crm.objects.quotes.read",
      "crm.objects.quotes.write",
      "crm.objects.invoices.read",
      "crm.objects.invoices.write",
      "crm.objects.orders.read",
      "crm.objects.orders.write",
      "crm.objects.subscriptions.read",
      "crm.objects.subscriptions.write",
      "crm.objects.appointments.read",
      "crm.objects.appointments.write",
      "crm.objects.courses.read",
      "crm.objects.courses.write",
      "crm.objects.goals.read",
      "crm.objects.goals.write",
      "crm.objects.forecasts.read",
      "crm.objects.feedback_submissions.read",
      "crm.objects.marketing_events.read",
      "crm.objects.marketing_events.write",
      "crm.objects.users.read",
      "crm.objects.users.write",
      "crm.objects.carts.read",
      "crm.objects.carts.write",
      "crm.objects.commercepayments.read",
      "crm.objects.commercepayments.write",
      "crm.objects.listings.read",
      "crm.objects.listings.write",
      "crm.objects.services.read",
      "crm.objects.services.write",
      "crm.objects.projects.read",
      "crm.objects.projects.write",
      "crm.objects.partner-clients.read",
      "crm.objects.partner-clients.write",
      "crm.objects.partner-services.read",
      "crm.objects.partner-services.write",
      "crm.schemas.contacts.read",
      "crm.schemas.contacts.write",
      "crm.schemas.companies.read",
      "crm.schemas.companies.write",
      "crm.schemas.deals.read",
      "crm.schemas.deals.write",
      "crm.schemas.custom.read",
      "crm.schemas.appointments.read",
      "crm.schemas.appointments.write",
      "crm.schemas.carts.read",
      "crm.schemas.carts.write",
      "crm.schemas.commercepayments.read",
      "crm.schemas.commercepayments.write",
      "crm.schemas.courses.read",
      "crm.schemas.courses.write",
      "crm.schemas.forecasts.read",
      "crm.schemas.invoices.read",
      "crm.schemas.invoices.write",
      "crm.schemas.line_items.read",
      "crm.schemas.listings.read",
      "crm.schemas.listings.write",
      "crm.schemas.orders.read",
      "crm.schemas.orders.write",
      "crm.schemas.projects.read",
      "crm.schemas.projects.write",
      "crm.schemas.quotes.read",
      "crm.schemas.quotes.write",
      "crm.schemas.services.read",
      "crm.schemas.services.write",
      "crm.schemas.subscriptions.read",
      "crm.schemas.subscriptions.write",
      "crm.lists.read",
      "crm.lists.write",
      "crm.import",
      "crm.export",
      "crm.dealsplits.read_write",
      "crm.pipelines.orders.read",
      "crm.pipelines.orders.write",
      "crm.extensions_calling_transcripts.read",
      "marketing.campaigns.read",
      "marketing.campaigns.revenue.read",
      "marketing.campaigns.write",
      "automation.sequences.enrollments.write",
      "automation.sequences.read",
      "crm.objects.tickets.read",
      "crm.objects.tickets.write",
    ],
    extraAuthParams: {},
  },
  createClient(tokens) {
    return {
      accessToken: tokens.accessToken,
      baseUrl: "https://api.hubapi.com",
    } satisfies HubSpotCrmClient;
  },
  tools,
  toolCount: tools.length,
  toolGroups: {
    objects: {
      description: "Core CRUD, search, and batch operations on all CRM object types",
      tools: [
        "hubspot_crm_manage_objects",
        "hubspot_crm_search_objects",
        "hubspot_crm_batch_objects",
        "hubspot_crm_manage_associations",
        "hubspot_crm_merge_objects",
      ],
    },
    properties: {
      description: "Object property and schema management",
      tools: [
        "hubspot_crm_manage_properties",
        "hubspot_crm_manage_property_groups",
        "hubspot_crm_manage_schemas",
        "hubspot_crm_get_object_schema",
      ],
    },
    pipelines: {
      description: "Deal/ticket pipeline and stage management",
      tools: [
        "hubspot_crm_manage_pipelines",
        "hubspot_crm_manage_pipeline_stages",
      ],
    },
    owners: {
      description: "Read-only owner and user data",
      tools: ["hubspot_crm_manage_owners", "hubspot_crm_manage_users"],
    },
    lists: {
      description: "CRM list management and memberships",
      tools: ["hubspot_crm_manage_lists"],
    },
    import_export: {
      description: "Bulk data import and export jobs",
      tools: ["hubspot_crm_manage_imports", "hubspot_crm_manage_exports"],
    },
    specialized: {
      description: "Deal splits, transcripts, marketing events, feedback, forecasts",
      tools: [
        "hubspot_crm_manage_deal_splits",
        "hubspot_crm_manage_calling_transcripts",
        "hubspot_crm_manage_marketing_events",
        "hubspot_crm_manage_feedback_submissions",
        "hubspot_crm_manage_forecasts",
      ],
    },
    marketing_automation: {
      description: "Marketing campaigns and automation sequences",
      tools: ["hubspot_crm_manage_campaigns", "hubspot_crm_manage_sequences"],
    },
  },
};
