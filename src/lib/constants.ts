export const siteConfig = {
  name: "Switchboard",
  description:
    "One URL. Every tool. The corporate app store for AI tools via MCP.",
  url: "https://get-switchboard.com",
};

export const navItems = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Integrations", href: "#integrations" },
  { label: "Pricing", href: "#pricing" },
];

export const heroContent = {
  badge: "Now in Early Access",
  headline: "One URL. Every tool.",
  subheadline:
    "Switchboard is the corporate app store for AI tools. Give every employee a single MCP endpoint that connects their AI assistant to every tool they need — managed, secured, and observable.",
  primaryCta: { label: "Join the Waitlist", href: "#waitlist" },
  secondaryCta: { label: "See How It Works", href: "#how-it-works" },
};

export const problemCards = [
  {
    icon: "wrench",
    title: "Manual Setup Hell",
    description:
      "Every employee manually configures each MCP server. Different versions, different configs, constant breakage.",
  },
  {
    icon: "shuffle",
    title: "No Consistency",
    description:
      "No way to enforce which tools are available, how they're configured, or what permissions they have.",
  },
  {
    icon: "eye-off",
    title: "Zero Visibility",
    description:
      "IT has no idea which AI tools are being used, what data they access, or whether they comply with policy.",
  },
];

export const howItWorksSteps = [
  {
    step: 1,
    title: "Admin Configures",
    description:
      "Set up integrations once in the Switchboard dashboard. Define which tools each team gets, with what permissions.",
    code: "Engineering → GitHub, Slack, Linear\nSales       → Salesforce, Gmail, Notion\nMarketing   → Google Ads, Slack, HubSpot\n\nPermissions: scoped per team ✓",
  },
  {
    step: 2,
    title: "Employee Gets a URL",
    description:
      "Each employee receives a single MCP endpoint. Drop it into Claude, Cursor, or any MCP-compatible client.",
    code: "MCP Endpoint:\nmcp.get-switchboard.com/u/jane\n\nStatus: ● Connected\nTools:  12 available",
  },
  {
    step: 3,
    title: "AI Tools Just Work",
    description:
      "The AI assistant discovers all available tools automatically. No setup, no config files, no maintenance.",
    code: '> "Schedule a standup and file the bug"\n  ✓ Google Calendar — meeting created\n  ✓ Slack — #team notified\n  ✓ Linear — BUG-437 opened',
  },
];

export const integrations = [
  {
    name: "Google Workspace",
    description: "Gmail, Calendar, Drive, Docs — full suite access for your AI assistant.",
    icon: "/integrations/google.svg",
    available: true,
  },
  {
    name: "HubSpot",
    description: "CRM, marketing, and sales — manage contacts, deals, and campaigns.",
    icon: "/integrations/hubspot.svg",
    available: true,
  },
  {
    name: "Slack",
    description: "Send messages, search channels, manage workflows from any AI tool.",
    icon: "/integrations/slack.svg",
    available: true,
  },
  {
    name: "Shortcut",
    description: "Project management for software teams — stories, epics, and iterations.",
    icon: "/integrations/shortcut.svg",
    available: true,
  },
  {
    name: "Asana",
    description: "Track projects, manage tasks, and coordinate team workflows.",
    icon: "/integrations/asana.svg",
    available: true,
  },
  {
    name: "Granola",
    description: "AI meeting notes — automatic transcription, summaries, and action items.",
    icon: "/integrations/granola.svg",
    available: true,
  },
  {
    name: "Gong",
    description: "Revenue intelligence — call recordings, deal insights, and coaching.",
    icon: "/integrations/gong.svg",
    available: true,
  },
  {
    name: "GitHub",
    description: "Issues, PRs, code search, and repository management via natural language.",
    icon: "/integrations/github.svg",
    available: true,
  },
  {
    name: "Notion",
    description: "Create pages, query databases, and manage your team's knowledge base.",
    icon: "/integrations/notion.svg",
    available: false,
  },
  {
    name: "Jira",
    description: "Create and manage issues, track sprints, and update project boards.",
    icon: "/integrations/jira.svg",
    available: false,
  },
  {
    name: "Salesforce",
    description: "Access CRM data, update records, and automate sales workflows.",
    icon: "/integrations/salesforce.svg",
    available: false,
  },
];

export const skillExamples = [
  "Schedule a meeting with the design team",
  "Create a Jira ticket for the login bug",
  "Summarize yesterday's #engineering Slack messages",
  "Find all open PRs that need my review",
  "Draft an email to the client about the delay",
  "Update the Q1 roadmap in Notion",
];

export const pricingPlans = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "For individuals exploring AI tools with MCP.",
    features: [
      "1 user",
      "3 integrations",
      "Community support",
      "100 requests/day",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Starter",
    price: "$5",
    period: "/seat/mo",
    description: "For small teams that want managed AI tool access.",
    features: [
      "Up to 25 users",
      "All integrations",
      "Team management dashboard",
      "5,000 requests/day",
      "Email support",
      "Usage analytics",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Pro",
    price: "$15",
    period: "/seat/mo",
    description: "For organizations that need control and compliance.",
    features: [
      "Unlimited users",
      "All integrations + custom",
      "SSO & SCIM provisioning",
      "Unlimited requests",
      "Priority support & SLA",
      "Audit logs & compliance",
      "Custom skills builder",
      "Dedicated account manager",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
];

export const footerLinks = {
  product: {
    title: "Product",
    links: [
      { label: "How It Works", href: "#how-it-works" },
      { label: "Integrations", href: "#integrations" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
};
