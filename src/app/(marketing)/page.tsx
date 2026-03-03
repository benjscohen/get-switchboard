import { Hero } from "@/components/sections/hero";
import { Problem } from "@/components/sections/problem";
import { Depth } from "@/components/sections/depth";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Integrations } from "@/components/sections/integrations";
import { Skills } from "@/components/sections/skills";
import { Pricing } from "@/components/sections/pricing";
import { CTA } from "@/components/sections/cta";

export default function Home() {
  return (
    <>
      <Hero />
      <Problem />
      <Depth />
      <HowItWorks />
      <Integrations />
      <Skills />
      <Pricing />
      <CTA />
    </>
  );
}
