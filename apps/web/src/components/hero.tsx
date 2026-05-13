import Link from "next/link";
import Image from "next/image";
import { Button } from "@tacholens/ui/components/button";

const GITHUB_REPO = "https://github.com/jakewtaylor/tacho-ui";
const LATEST_RELEASE = `${GITHUB_REPO}/releases/latest`;

export function Hero() {
  return (
    <section className="py-20">
      <div className="relative z-10 mx-auto w-full max-w-2xl px-6 lg:px-0">
        <div className="relative">
          <Image
            src="/appicon.png"
            alt=""
            width={56}
            height={56}
            priority
            className="size-14 rounded-2xl shadow-lg shadow-black/15 ring-1 ring-black/10"
          />

          <h1 className="mt-12 max-w-xl text-balance text-5xl font-medium">
            See your tacho data clearly.
          </h1>

          <p className="text-muted-foreground mt-4 mb-6 max-w-lg text-balance text-xl">
            Drop a{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-base">
              .ddd
            </code>{" "}
            driver-card download into TachoLens and get a full breakdown of
            driving sessions, breaks, weekly summaries, and EU 561/2006
            compliance — without uploading your data anywhere.
          </p>

          <div className="flex flex-col items-stretch gap-2 *:w-full sm:flex-row sm:items-center sm:*:w-auto">
            <Button asChild size="lg">
              <Link href={LATEST_RELEASE}>
                <span className="text-nowrap">Download for macOS</span>
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href={GITHUB_REPO}>
                <span className="text-nowrap">View on GitHub</span>
              </Link>
            </Button>
          </div>
        </div>

        <div className="relative mt-12 overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-200 via-zinc-100 to-zinc-300 md:mt-16 dark:from-zinc-800 dark:via-zinc-900 dark:to-black">
          <div className="bg-background rounded-(--radius) relative m-4 overflow-hidden border border-transparent shadow-xl shadow-black/15 ring-1 ring-black/10 sm:m-8 md:m-12">
            {/* Placeholder until we drop a real screenshot here.
                Replace /screenshot.png in apps/web/public/ with an export
                from the running app. */}
            <Image
              src="/appicon.png"
              alt="TachoLens application"
              width={2880}
              height={1842}
              className="size-full object-contain p-12 sm:p-20"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
