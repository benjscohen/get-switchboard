"use client";

import { motion } from "motion/react";
import { heroContent } from "@/lib/constants";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const toolColors: Record<string, string> = {
  Google: "#4285F4",
  Slack: "#E01E5A",
  GitHub: "#24292F",
  Notion: "#000000",
};

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-40 pb-24 md:pt-52 md:pb-32">
      {/* Gradient background effects */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-200px] left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-accent/8 blur-[120px]" />
        <div className="absolute top-[100px] left-1/4 h-[300px] w-[400px] rounded-full bg-accent/5 blur-[100px]" />
        <div className="absolute top-[100px] right-1/4 h-[300px] w-[400px] rounded-full bg-accent/4 blur-[100px]" />
      </div>

      <Container className="relative">
        <motion.div
          className="mx-auto max-w-3xl text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Badge variant="accent">{heroContent.badge}</Badge>

          <h1 className="mt-6 text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl">
            {heroContent.headline}
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary md:text-xl">
            {heroContent.subheadline}
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button href={heroContent.primaryCta.href} size="lg">
              {heroContent.primaryCta.label}
            </Button>
            <Button
              href={heroContent.secondaryCta.href}
              variant="secondary"
              size="lg"
            >
              {heroContent.secondaryCta.label}
            </Button>
          </div>
        </motion.div>

        {/* Visual: single endpoint → multiple tools */}
        <motion.div
          className="mt-16 md:mt-24"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="mx-auto max-w-2xl rounded-2xl border border-border/60 bg-bg-card/80 p-8 shadow-xl shadow-black/8 backdrop-blur-sm md:p-10">
            {/* Terminal header dots */}
            <div className="mb-6 flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-[#FF5F57]" />
              <div className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
              <div className="h-3 w-3 rounded-full bg-[#28C840]" />
              <span className="ml-3 text-xs text-text-tertiary">MCP Endpoint</span>
            </div>

            {/* Single endpoint */}
            <div className="rounded-lg border border-accent/30 bg-accent/5 px-5 py-3.5 text-center font-mono text-sm text-accent">
              mcp.get-switchboard.com/u/jane
            </div>

            {/* Branching connector + tools */}
            <div className="text-border-hover">
              {/* Center trunk */}
              <div className="mx-auto h-8 w-px bg-current" />

              {/* Horizontal bar + vertical branches + app boxes */}
              <div className="relative grid grid-cols-4 gap-2 sm:gap-3">
                {/* Horizontal bar connecting column centers */}
                <div
                  className="pointer-events-none absolute top-0 h-px bg-current"
                  style={{
                    left: 'calc((100% - 1.5rem) / 8)',
                    right: 'calc((100% - 1.5rem) / 8)',
                  }}
                />

                {Object.entries(toolColors).map(([tool, color], i) => (
                  <div key={tool} className="flex flex-col items-center">
                    {/* Vertical branch */}
                    <div className="relative h-8 w-px bg-current overflow-visible">
                      {/* Animated dot */}
                      <motion.div
                        className="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-accent"
                        animate={{ top: ['-4px', '32px'], opacity: [0, 0.8, 0.8, 0] }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          delay: i * 0.3,
                          ease: 'linear',
                        }}
                      />
                    </div>
                    {/* App box */}
                    <div className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-bg px-2 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-border-hover sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      {tool}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </Container>
    </section>
  );
}
