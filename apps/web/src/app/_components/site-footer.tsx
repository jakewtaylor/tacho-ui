import Image from "next/image";
import { release } from "../_content/release";

const linkGroups: { heading: string; items: string[] }[] = [
  {
    heading: "Product",
    items: ["Download", "Changelog", "Roadmap", "Sample .ddd file"],
  },
  { heading: "Docs", items: ["Importing", "Rules engine", "Print layouts", "FAQ"] },
  {
    heading: "Code",
    items: ["GitHub", "Apache-2.0 licence", "Issues", "tachoparser"],
  },
];

export function SiteFooter() {
  return (
    <footer id="changelog" className="border-t border-hairline">
      <div className="max-w-[1200px] mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-5 gap-8 text-[13px]">
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
            and anyone keeping their own EU 561 records.
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
              {g.items.map((i) => (
                <li key={i}>
                  <a className="hover:text-ink" href="#">
                    {i}
                  </a>
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
          <span>
            tacholens.com<span className="blink">_</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
