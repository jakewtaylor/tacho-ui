import Image from "next/image";

const GITHUB_REPO = "https://github.com/jakewtaylor/tacho-ui";
const LATEST_DMG_URL = `${GITHUB_REPO}/releases/latest`;

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-12 px-6 py-24 sm:px-12">
        <Image
          src="/appicon.png"
          alt=""
          width={128}
          height={128}
          priority
          className="rounded-2xl shadow-lg"
        />

        <div className="flex flex-col items-center gap-6 text-center">
          <h1 className="text-5xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-6xl">
            TachoLens
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-zinc-700 dark:text-zinc-300">
            See your tachograph data clearly. Drop a{" "}
            <code className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-sm dark:bg-zinc-800">
              .ddd
            </code>{" "}
            driver-card download into the app and get a full breakdown of
            driving sessions, breaks, weekly summaries, and EU 561/2006
            compliance — without uploading your data anywhere.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            className="flex h-12 items-center justify-center rounded-full bg-zinc-900 px-8 text-base font-medium text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
            href={LATEST_DMG_URL}
          >
            Download for macOS
          </a>
          <a
            className="flex h-12 items-center justify-center rounded-full border border-zinc-300 px-8 text-base font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
            href={GITHUB_REPO}
          >
            View on GitHub
          </a>
        </div>

        <ul className="grid w-full max-w-2xl grid-cols-1 gap-4 text-sm text-zinc-700 dark:text-zinc-300 sm:grid-cols-2">
          <Feature title="Local-first">
            Your data stays on your Mac. No upload, no account.
          </Feature>
          <Feature title="Compliance ready">
            EU 561/2006 rules engine: continuous-drive, daily/weekly, rest
            periods, 15+30 split breaks.
          </Feature>
          <Feature title="Weekly summary">
            Printable A4 reports. Per-day breakdown, breach annotations.
          </Feature>
          <Feature title="GNSS map">
            Gen-2 card location samples plotted on a real map of your routes.
          </Feature>
        </ul>
      </main>

      <footer className="w-full border-t border-zinc-200 py-6 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
        Code-signed and notarized for macOS · Auto-updates via Sparkle
      </footer>
    </div>
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
    <li className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="font-medium text-zinc-900 dark:text-zinc-100">{title}</div>
      <div className="mt-1">{children}</div>
    </li>
  );
}
