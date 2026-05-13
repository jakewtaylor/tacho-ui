import Link from "next/link";

export default function BuyCancelPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-20 bg-paper text-ink">
      <div className="max-w-xl w-full">
        <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
          checkout cancelled
        </div>
        <h1 className="mt-2 font-heading text-[36px] font-semibold tracking-tight leading-[1.1]">
          No charge made.
        </h1>
        <p className="mt-4 text-[16px] text-ink-2 leading-relaxed">
          You closed the Stripe page before completing the purchase. TachoLens
          works in trial mode without a license — imports just don&apos;t
          persist between sessions.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/#download"
            className="inline-flex items-center gap-2 px-5 h-12 rounded-md bg-ink text-white text-[14px] font-medium hover:bg-ink/90"
          >
            Try again
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 h-12 rounded-md border border-hairline text-ink text-[14px] font-medium hover:bg-paper-2"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
