"use client";

import { motion } from "motion/react";
import { pricingPlans } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import {
  Section,
  SectionHeader,
  SectionTitle,
  SectionDescription,
} from "@/components/ui/section";

export function Pricing() {
  return (
    <Section id="pricing">
      <Container>
        <SectionHeader>
          <SectionTitle>Simple, Transparent Pricing</SectionTitle>
          <SectionDescription>
            Start free. Scale as your team grows.
          </SectionDescription>
        </SectionHeader>

        <div className="grid gap-6 md:grid-cols-3">
          {pricingPlans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="flex"
            >
              <div
                className={cn(
                  "flex w-full flex-col rounded-xl border p-6",
                  plan.highlighted
                    ? "border-accent bg-accent/5 shadow-lg shadow-accent/10"
                    : "border-border bg-bg-card"
                )}
              >
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  {plan.period && (
                    <span className="text-sm text-text-secondary">
                      {plan.period}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm text-text-secondary">
                  {plan.description}
                </p>

                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-text-secondary"
                    >
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button
                  variant={plan.highlighted ? "primary" : "secondary"}
                  className="mt-6 w-full"
                  href="#waitlist"
                >
                  {plan.cta}
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </Container>
    </Section>
  );
}
