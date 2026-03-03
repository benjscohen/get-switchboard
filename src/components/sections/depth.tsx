"use client";

import { motion } from "motion/react";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import {
  Section,
  SectionHeader,
  SectionTitle,
  SectionDescription,
} from "@/components/ui/section";

const comparisons = [
  {
    integration: "Google Sheets",
    typical: {
      count: 4,
      note: "Read-only — can't even write to a cell",
      tools: [
        "Find spreadsheets",
        "Get metadata",
        "Get cell range",
        "Get text content",
      ],
    },
    switchboard: {
      count: 16,
      note: "Full read, write, format, and manage",
      highlights: [
        "Read & write data",
        "Create spreadsheets",
        "Cell & conditional formatting",
        "Sort, filter & validate",
        "Charts & tab management",
        "Named ranges & structure",
      ],
    },
  },
  {
    integration: "Google Calendar",
    typical: {
      count: 8,
      note: "Basic CRUD only",
      tools: [
        "List events",
        "Get event",
        "Create event",
        "Update event",
        "Delete event",
        "Find free time",
        "Respond to event",
        "List calendars",
      ],
    },
    switchboard: {
      count: 33,
      note: "Full API — events, calendars, sharing, notifications",
      highlights: [
        "Batch create/update/delete",
        "Recurring event management",
        "Calendar sharing & ACL",
        "Push notification webhooks",
        "Quick-add from natural language",
        "iCal import, search & more",
      ],
    },
  },
];

const capabilities = [
  {
    title: "Full API, not a subset",
    description:
      "We don't skip endpoints. Every integration covers the complete API surface — reads, writes, batch ops, admin controls, and more.",
  },
  {
    title: "Real automation, not demos",
    description:
      "Sharing a calendar, formatting a spreadsheet, batch-updating 50 events — real workflows require deep tools.",
  },
  {
    title: "Better tools, smarter AI",
    description:
      'More specific tools means the AI picks the right one. A "quick add" tool is faster and more reliable than building an event object from scratch.',
  },
];

function Bar({
  count,
  max,
  accent,
  delay,
}: {
  count: number;
  max: number;
  accent?: boolean;
  delay: number;
}) {
  const pct = Math.round((count / max) * 100);
  return (
    <div className="h-2 w-full rounded-full bg-border/40">
      <motion.div
        className={`h-full rounded-full ${accent ? "bg-accent" : "bg-text-tertiary/60"}`}
        initial={{ width: 0 }}
        whileInView={{ width: `${pct}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay, ease: "easeOut" }}
      />
    </div>
  );
}

function ComparisonCard({
  comparison,
  index,
}: {
  comparison: (typeof comparisons)[number];
  index: number;
}) {
  const { integration, typical, switchboard } = comparison;
  const max = switchboard.count;
  const baseDelay = index * 0.2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.4, delay: baseDelay }}
    >
      <Card hover={false} className="h-full">
        <h3 className="mb-6 text-lg font-semibold">{integration}</h3>

        {/* Typical MCP */}
        <div className="mb-5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm text-text-tertiary">Typical MCP</span>
            <span className="font-mono text-sm text-text-tertiary">
              {typical.count} tools
            </span>
          </div>
          <Bar count={typical.count} max={max} delay={baseDelay + 0.2} />
          <p className="mt-2 text-xs text-text-tertiary">{typical.note}</p>
        </div>

        {/* Divider */}
        <div className="mb-5 border-t border-border/50" />

        {/* Switchboard */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-medium text-accent">Switchboard</span>
            <span className="font-mono text-sm font-semibold text-accent">
              {switchboard.count} tools
            </span>
          </div>
          <Bar count={switchboard.count} max={max} accent delay={baseDelay + 0.4} />
          <p className="mt-2 text-xs text-text-secondary">{switchboard.note}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {switchboard.highlights.map((h) => (
              <span
                key={h}
                className="rounded-md border border-accent/20 bg-accent/5 px-2 py-0.5 text-xs text-accent"
              >
                {h}
              </span>
            ))}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export function Depth() {
  return (
    <Section>
      <Container>
        <SectionHeader>
          <SectionTitle>
            Deeper Integrations. Real Automation.
          </SectionTitle>
          <SectionDescription>
            Off-the-shelf MCP servers give your AI a handful of basic operations.
            Switchboard covers the full API surface — so your AI can do real
            work, not toy demos.
          </SectionDescription>
        </SectionHeader>

        {/* Comparison cards */}
        <div className="grid gap-6 md:grid-cols-2">
          {comparisons.map((comp, i) => (
            <ComparisonCard key={comp.integration} comparison={comp} index={i} />
          ))}
        </div>

        {/* Capability highlights */}
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {capabilities.map((cap, i) => (
            <motion.div
              key={cap.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <Card className="h-full">
                <h3 className="font-semibold">{cap.title}</h3>
                <p className="mt-2 text-sm text-text-secondary">
                  {cap.description}
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
      </Container>
    </Section>
  );
}
