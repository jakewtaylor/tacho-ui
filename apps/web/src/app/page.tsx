import { Hero } from "@/components/hero";

export default function Home() {
  return (
    <>
      <Hero />
      <Features />
      <Footer />
    </>
  );
}

function Features() {
  return (
    <section className="border-t border-border bg-muted/30 py-20">
      <div className="mx-auto w-full max-w-4xl px-6 lg:px-0">
        <h2 className="text-balance text-3xl font-medium">
          Built for drivers, owner-operators, and small fleets.
        </h2>
        <p className="text-muted-foreground mt-3 max-w-2xl text-balance text-lg">
          Everything happens on your Mac. There&apos;s no upload, no cloud,
          no account. Your card data never leaves the device.
        </p>

        <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Feature title="Compliance, decoded">
            EU 561/2006 rules engine: continuous-drive, daily and weekly
            limits, daily-rest minima, the 15+30 split-break replacement,
            and weekly-rest verification across card-not-inserted gaps.
          </Feature>
          <Feature title="Weekly summary">
            Printable A4 reports with per-day breakdowns, breach
            annotations, and totals across the week.
          </Feature>
          <Feature title="Map of your routes">
            Gen-2 card GNSS samples plotted on a real map. Filter by
            day; trip segments link through to the activity timeline.
          </Feature>
          <Feature title="One install, every update">
            Code-signed and notarized for macOS. Auto-updates land
            quietly via Sparkle — no checking, no copy-pasting URLs.
          </Feature>
        </ul>
      </div>
    </section>
  );
}

function Feature({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="rounded-xl border border-border bg-background px-5 py-4">
      <div className="font-medium">{title}</div>
      <div className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
        {children}
      </div>
    </li>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-8">
      <div className="text-muted-foreground mx-auto flex w-full max-w-4xl flex-col items-center gap-2 px-6 text-center text-xs lg:px-0">
        <p>
          TachoLens · open source ·{" "}
          <a
            className="underline hover:text-foreground"
            href="https://github.com/jakewtaylor/tacho-ui"
          >
            github.com/jakewtaylor/tacho-ui
          </a>
        </p>
        <p>
          Compliance analysis is a best-effort interpretation of EU 561/2006.
          Confirm any disputed breach against the regulation text before
          acting on it.
        </p>
      </div>
    </footer>
  );
}
