import Image from "next/image";
import Link from "next/link";
import { release } from "../_content/release";

type LinkItem = { label: string; href: string };

const linkGroups: { heading: string; items: LinkItem[] }[] = [
  {
    heading: "Product",
    items: [
      { label: "Buy a license", href: "/#download" },
      { label: "Download trial", href: "/api/download" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    heading: "On the page",
    items: [
      { label: "Features", href: "/#features" },
      { label: "What it flags", href: "/#rules" },
      { label: "Privacy", href: "/#privacy" },
      { label: "Support", href: "/#support" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="max-w-[1200px] mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-[13px]">
        <div className="col-span-2">
          <div className="flex items-center gap-2.5">
            <Image
              src="/appicon.png"
              alt=""
              width={28}
              height={28}
              className="w-7 h-7 rounded-md"
            />
            <span className="font-heading font-semibold text-ink">
              TachoLens
            </span>
          </div>
          <p className="mt-3 text-ink-3 max-w-xs leading-relaxed">
            A local-first tachograph viewer for HGV drivers, traffic managers,
            and anyone keeping their own driving-activity records — a first
            look you verify yourself, never a compliance verdict.
          </p>
          <p className="mt-4 font-mono text-[10px] text-ink-3">
            {release.version} · {release.publishedDate}
          </p>
        </div>
        {linkGroups.map((g) => (
          <div key={g.heading}>
            <div className="font-heading font-semibold text-ink mb-3">
              {g.heading}
            </div>
            <ul className="space-y-1.5 text-ink-2">
              {g.items.map((item) => (
                <li key={item.label}>
                  <Link className="hover:text-ink" href={item.href}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-hairline">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] text-ink-3">
          <span>
            © 2026 TachoLens · made for drivers, by a developer who reads
            regulations.
          </span>
          <div className="flex items-center gap-4">
            <a
              href={release.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink"
              title="TachoLens is AGPL-3.0; source on GitHub"
            >
              Source
            </a>
            <span>
              tacholens.com<span className="blink">_</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
