"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";

export function CTA() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <Section id="waitlist">
      <Container>
        <motion.div
          className="relative mx-auto max-w-2xl overflow-hidden rounded-2xl border border-border bg-bg-card p-8 text-center md:p-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          {/* Subtle gradient background */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 left-1/2 h-[300px] w-[500px] -translate-x-1/2 rounded-full bg-accent/10 blur-[100px]" />
          </div>

          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Get Early Access
            </h2>
            <p className="mt-4 text-lg text-text-secondary">
              Join the waitlist and be the first to give your team a single URL
              for every AI tool.
            </p>

            {status === "success" ? (
              <div className="mt-8 rounded-lg border border-accent/30 bg-accent/10 p-4 text-accent">
                You&apos;re on the list! We&apos;ll be in touch soon.
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="mt-8 flex flex-col gap-3 sm:flex-row"
              >
                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="flex-1"
                />
                <Button type="submit" disabled={status === "loading"}>
                  {status === "loading" ? "Joining..." : "Join Waitlist"}
                </Button>
              </form>
            )}

            {status === "error" && (
              <p className="mt-3 text-sm text-red-600">
                Something went wrong. Please try again.
              </p>
            )}

            <p className="mt-4 text-xs text-text-tertiary">
              No spam. We&apos;ll only email you about Switchboard updates.
            </p>
          </div>
        </motion.div>
      </Container>
    </Section>
  );
}
