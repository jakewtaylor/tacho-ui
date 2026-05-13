import Image from "next/image";
import Link from "next/link";
import { release } from "../_content/release";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-paper/90 backdrop-blur">
      <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center gap-6">
        <Link href="/#top" className="flex items-center gap-2.5">
          <Image
            src="/appicon.png"
            alt=""
            width={28}
            height={28}
            className="w-7 h-7 rounded-md shadow-sm"
            priority
          />
          <span className="font-heading font-semibold text-ink tracking-tight">
            TachoLens
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-5 text-[13px] text-ink-2 ml-2">
          <Link href="/#features" className="hover:text-ink">
            Features
          </Link>
          <Link href="/#rules" className="hover:text-ink">
            What it flags
          </Link>
          <Link href="/#privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link href="/#support" className="hover:text-ink">
            Support
          </Link>
          <Link href="/changelog" className="hover:text-ink">
            Changelog
          </Link>
        </nav>
        <div className="flex-1" />
        <form action="/api/checkout" method="POST">
          <button
            type="submit"
            className="text-[13px] font-medium text-white px-3.5 h-9 inline-flex items-center rounded-md bg-ink hover:opacity-90"
          >
            Buy
            <span className="font-mono text-white/60 ml-2 text-[11px]">
              {release.version}
            </span>
          </button>
        </form>
      </div>
    </header>
  );
}
