"use client";

import { motion } from "motion/react";
import { skillExamples } from "@/lib/constants";
import { Container } from "@/components/ui/container";
import {
  Section,
  SectionHeader,
  SectionTitle,
  SectionDescription,
} from "@/components/ui/section";

export function Skills() {
  return (
    <Section className="bg-bg-card/30">
      <Container>
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <SectionHeader className="mx-0 mb-0 text-left">
              <SectionTitle>Enterprise Skills</SectionTitle>
              <SectionDescription>
                Pre-built workflows that combine multiple tools into single
                natural-language commands. Your team gets superpowers on day one.
              </SectionDescription>
            </SectionHeader>

            <div className="mt-8 space-y-3">
              <div className="flex items-center gap-3 text-sm text-text-secondary">
                <svg className="h-5 w-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Combine multiple tools in one command
              </div>
              <div className="flex items-center gap-3 text-sm text-text-secondary">
                <svg className="h-5 w-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Admin-curated, team-specific skill sets
              </div>
              <div className="flex items-center gap-3 text-sm text-text-secondary">
                <svg className="h-5 w-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Build custom skills with the Pro plan
              </div>
            </div>
          </div>

          {/* Skill chips */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.5 }}
          >
            <div className="rounded-xl border border-border bg-bg-card p-6">
              <p className="mb-4 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Example prompts your team can use
              </p>
              <div className="flex flex-wrap gap-2">
                {skillExamples.map((skill, i) => (
                  <motion.span
                    key={skill}
                    className="rounded-full border border-border bg-bg px-3 py-1.5 font-mono text-xs text-text-secondary transition-colors hover:border-accent/30 hover:text-accent"
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                  >
                    {skill}
                  </motion.span>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </Container>
    </Section>
  );
}
