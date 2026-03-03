"use client";

import { motion } from "motion/react";
import { problemCards } from "@/lib/constants";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import {
  Section,
  SectionHeader,
  SectionTitle,
  SectionDescription,
} from "@/components/ui/section";

function ProblemIcon({ icon }: { icon: string }) {
  const iconClass = "h-6 w-6 text-accent";
  switch (icon) {
    case "wrench":
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case "shuffle":
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
        </svg>
      );
    case "eye-off":
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      );
    default:
      return null;
  }
}

export function Problem() {
  return (
    <Section className="border-t border-border/50">
      <Container>
        <SectionHeader>
          <SectionTitle>AI Tool Management Is Broken</SectionTitle>
          <SectionDescription>
            Your team uses AI assistants, but connecting them to internal tools
            is a nightmare of configs, credentials, and chaos.
          </SectionDescription>
        </SectionHeader>

        <div className="grid gap-6 md:grid-cols-3">
          {problemCards.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <Card className="h-full">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <ProblemIcon icon={card.icon} />
                </div>
                <h3 className="text-lg font-semibold">{card.title}</h3>
                <p className="mt-2 text-sm text-text-secondary">
                  {card.description}
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
      </Container>
    </Section>
  );
}
