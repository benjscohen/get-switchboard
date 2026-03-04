"use client";

import { motion } from "motion/react";
import { howItWorksSteps } from "@/lib/constants";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import {
  Section,
  SectionHeader,
  SectionTitle,
  SectionDescription,
} from "@/components/ui/section";

function StepOneGraphic() {
  return (
    <div className="mt-4 rounded-lg bg-bg p-3 font-mono text-xs leading-relaxed">
      <div className="mb-1">
        <span className="text-blue-600">Engineering</span>
        <span className="text-text-tertiary"> → </span>
        <span className="text-emerald-600">GitHub</span>
        <span className="text-text-tertiary">, </span>
        <span className="text-emerald-600">Slack</span>
        <span className="text-text-tertiary">, </span>
        <span className="text-emerald-600">Linear</span>
      </div>
      <div className="mb-1">
        <span className="text-purple-600">Sales</span>
        <span className="text-text-tertiary">       → </span>
        <span className="text-emerald-600">Salesforce</span>
        <span className="text-text-tertiary">, </span>
        <span className="text-emerald-600">Gmail</span>
        <span className="text-text-tertiary">, </span>
        <span className="text-emerald-600">Notion</span>
      </div>
      <div className="mb-3">
        <span className="text-orange-600">Marketing</span>
        <span className="text-text-tertiary"> → </span>
        <span className="text-emerald-600">Google Ads</span>
        <span className="text-text-tertiary">, </span>
        <span className="text-emerald-600">Slack</span>
        <span className="text-text-tertiary">, </span>
        <span className="text-emerald-600">HubSpot</span>
      </div>
      <div className="border-t border-border pt-2">
        <span className="text-text-tertiary">Permissions: scoped per team </span>
        <span className="text-emerald-600">✓</span>
      </div>
    </div>
  );
}

function StepTwoGraphic() {
  return (
    <div className="mt-4 rounded-lg bg-bg p-3 font-mono text-xs leading-relaxed">
      <div className="mb-1 text-text-tertiary">MCP Endpoint:</div>
      <div className="mb-3 text-blue-600">mcp.get-switchboard.com/u/jane</div>
      <div className="border-t border-border pt-2">
        <div className="mb-1">
          <span className="text-text-tertiary">Status: </span>
          <span className="text-emerald-600">● Connected</span>
        </div>
        <div>
          <span className="text-text-tertiary">Tools:  </span>
          <span className="text-text-primary">12 available</span>
        </div>
      </div>
    </div>
  );
}

function StepThreeGraphic() {
  return (
    <div className="mt-4 rounded-lg bg-bg p-3 font-mono text-xs leading-relaxed">
      <div className="mb-2">
        <span className="text-yellow-600">&gt; </span>
        <span className="text-text-primary">&quot;Schedule a standup and file the bug&quot;</span>
      </div>
      <div className="mb-1">
        <span className="text-emerald-600">  ✓ </span>
        <span className="text-blue-600">Google Calendar</span>
        <span className="text-text-tertiary"> — meeting created</span>
      </div>
      <div className="mb-1">
        <span className="text-emerald-600">  ✓ </span>
        <span className="text-purple-600">Slack</span>
        <span className="text-text-tertiary"> — #team notified</span>
      </div>
      <div>
        <span className="text-emerald-600">  ✓ </span>
        <span className="text-orange-600">Linear</span>
        <span className="text-text-tertiary"> — BUG-437 opened</span>
      </div>
    </div>
  );
}

const stepGraphics = [StepOneGraphic, StepTwoGraphic, StepThreeGraphic];

export function HowItWorks() {
  return (
    <Section id="how-it-works" className="bg-bg-card/50">
      <Container>
        <SectionHeader>
          <SectionTitle>How It Works</SectionTitle>
          <SectionDescription>
            Three steps from zero to every AI tool your team needs.
          </SectionDescription>
        </SectionHeader>

        <div className="grid gap-6 md:grid-cols-3">
          {howItWorksSteps.map((step, i) => {
            const Graphic = stepGraphics[i];
            return (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <Card className="h-full" hover={false}>
                  <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-text-primary">
                    {step.step}
                  </div>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-text-secondary">
                    {step.description}
                  </p>
                  <Graphic />
                </Card>
              </motion.div>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
