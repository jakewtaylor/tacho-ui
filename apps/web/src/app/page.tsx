import { CTA } from "./_components/cta";
import { Features } from "./_components/features";
import { Hero } from "./_components/hero";
import { HowItWorks } from "./_components/how-it-works";
import { Privacy } from "./_components/privacy";
import { RulesTable } from "./_components/rules-table";
import { SiteFooter } from "./_components/site-footer";
import { SiteNav } from "./_components/site-nav";

export default function Home() {
  return (
    <>
      <SiteNav />
      <Hero />
      <HowItWorks />
      <Features />
      <RulesTable />
      <Privacy />
      <CTA />
      <SiteFooter />
    </>
  );
}
