"use client";

import { motion } from "motion/react";
import { integrations } from "@/lib/constants";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Section,
  SectionHeader,
  SectionTitle,
  SectionDescription,
} from "@/components/ui/section";

function IntegrationIcon({ icon, name }: { icon: string; name: string }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center">
      <img src={icon} alt={name} className="h-7 w-7" />
    </div>
  );
}

export function Integrations() {
  const available = integrations.filter((i) => i.available);
  const comingSoon = integrations.filter((i) => !i.available);

  return (
    <Section id="integrations">
      <Container>
        <SectionHeader>
          <SectionTitle>Integrations</SectionTitle>
          <SectionDescription>
            Connect the tools your team already uses. One config, every employee.
          </SectionDescription>
        </SectionHeader>

        {/* Available integrations */}
        <div className="grid gap-4 sm:grid-cols-2">
          {available.map((integration, i) => (
            <motion.div
              key={integration.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <Card className="flex items-start gap-4">
                <IntegrationIcon icon={integration.icon} name={integration.name} />
                <div className="flex-1">
                  <h3 className="font-semibold">{integration.name}</h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    {integration.description}
                  </p>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Coming soon */}
        <motion.div
          className="mt-8"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <p className="mb-4 text-center text-sm text-text-tertiary">
            Coming soon
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {comingSoon.map((integration) => (
              <div
                key={integration.name}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-bg-card/50 px-4 py-3 opacity-60"
              >
                <IntegrationIcon icon={integration.icon} name={integration.name} />
                <div>
                  <p className="text-sm font-medium">{integration.name}</p>
                  <Badge className="mt-1">Soon</Badge>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </Container>
    </Section>
  );
}
