import { release } from "../_content/release";
import { getPriceInfo } from "@/lib/price";

export async function CTA() {
  const price = await getPriceInfo();
  const priceChip = price
    ? `${price.formatted} · 1 yr updates`
    : "one-time · 1 yr updates";
  return (
    <section id="download" className="bg-ink text-white">
      <div className="max-w-[1200px] mx-auto px-6 py-20 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-10 items-center">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-white/60">
            one-time purchase · code-signed · auto-updates
          </div>
          <h2 className="mt-2 font-heading text-[44px] font-semibold tracking-tight leading-[1.05]">
            Take your weeks back from the spreadsheet.
          </h2>
          <p className="mt-4 text-[16px] text-white/70 max-w-xl leading-relaxed">
            macOS 12 Monterey or later. Universal binary, {release.dmgSizeMb} MB.
            Code-signed by a Developer ID certificate and notarised by Apple.
          </p>
        </div>
        <div className="flex flex-col gap-3 lg:items-end">
          <form action="/api/checkout" method="POST">
            <button
              type="submit"
              className="inline-flex items-center gap-3 px-6 h-14 rounded-md bg-white text-ink text-[16px] font-medium hover:bg-white/90"
            >
              Buy a license
              <span className="font-mono text-[12px] text-ink-3 border-l border-hairline pl-3">
                {priceChip}
              </span>
            </button>
          </form>
          <a
            href="/api/download"
            className="inline-flex items-center gap-3 px-5 h-11 rounded-md border border-white/20 text-white text-[14px] font-medium hover:bg-white/5"
          >
            <AppleIcon />
            Download {release.version}
            <span className="font-mono text-[11px] text-white/40 border-l border-white/15 pl-3">
              .dmg · {release.dmgSizeMb} MB · trial mode
            </span>
          </a>
          <div className="font-mono text-[10px] text-white/40 lg:text-right">
            macOS · Linux/Windows on the roadmap
          </div>
        </div>
      </div>
    </section>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.365 1.43c0 1.14-.41 2.21-1.16 3.05-.84.95-2.2 1.69-3.34 1.6-.14-1.1.43-2.24 1.16-3.04.83-.92 2.27-1.62 3.34-1.61Zm3.62 16.13c-.65 1.52-.97 2.2-1.81 3.54-1.17 1.86-2.81 4.18-4.85 4.2-1.82.02-2.29-1.19-4.76-1.18-2.47.01-2.99 1.2-4.8 1.18-2.04-.02-3.6-2.11-4.77-3.97C-.27 18.4-.78 14.18.91 11.75c1.2-1.73 3.1-2.74 4.88-2.74 1.86 0 3.03 1.02 4.57 1.02 1.49 0 2.4-1.02 4.55-1.02 1.62 0 3.34.88 4.56 2.4-4.01 2.2-3.36 7.91 1 7.95Z"
      />
    </svg>
  );
}
