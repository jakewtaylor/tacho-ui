import Link from "next/link";

export const dynamic = "force-dynamic";

export default function BuySuccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-20 bg-paper text-ink">
      <div className="max-w-xl w-full">
        <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
          payment received
        </div>
        <h1 className="mt-2 font-heading text-[36px] font-semibold tracking-tight leading-[1.1]">
          Thanks for buying TachoLens.
        </h1>
        <p className="mt-4 text-[16px] text-ink-2 leading-relaxed">
          We&apos;ve emailed your license key. Open TachoLens, hit{" "}
          <strong>Enter license key</strong>, and paste the value from the email
          to switch on persistent imports.
        </p>
        <p className="mt-4 text-[14px] text-ink-3 leading-relaxed">
          Can&apos;t find it? Check spam. If it&apos;s still not there, email{" "}
          <a className="underline" href="mailto:hello@tacholens.com">
            hello@tacholens.com
          </a>{" "}
          and we&apos;ll resend.
        </p>
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 h-12 rounded-md bg-ink text-white text-[14px] font-medium hover:bg-ink/90"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
