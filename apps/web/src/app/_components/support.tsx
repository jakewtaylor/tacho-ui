const SUPPORT_EMAIL = "support@tacholens.com";

const helpsWith: { title: string; sub: string }[] = [
  {
    title: "License recovery",
    sub: "lost key, new machine, activation issues",
  },
  {
    title: "Bug reports",
    sub: "unexpected output, crashes, .ddd files that won't parse",
  },
  {
    title: "Edge cases & questions",
    sub: "anything you'd want a human to look at",
  },
];

export function Support() {
  return (
    <section
      id="support"
      className="max-w-[1200px] px-6 py-20 border-t border-hairline mx-auto w-full"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-10 items-start">
        <div>
          <div className="eyebrow">support</div>
          <h2 className="font-heading text-[32px] font-semibold tracking-tight text-ink mt-2 leading-tight">
            Email a human. We&apos;ll reply.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-2 max-w-md">
            TachoLens is built and maintained by a small team. Questions go
            straight to someone who can read the code. We aim to reply within
            one UK business day.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=TachoLens%20support`}
            className="mt-6 inline-flex items-center gap-3 px-5 h-12 rounded-md bg-ink text-white text-[15px] font-medium hover:opacity-90"
          >
            <MailIcon />
            {SUPPORT_EMAIL}
          </a>
          <p className="mt-3 font-mono text-[11px] text-ink-3">
            replies usually within 1 business day · UK timezone
          </p>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-1 gap-px bg-hairline border border-hairline-strong rounded-xl overflow-hidden">
          {helpsWith.map((h) => (
            <li
              key={h.title}
              className="bg-paper px-5 py-4 flex flex-col gap-1"
            >
              <div className="font-heading text-[15px] font-semibold text-ink">
                {h.title}
              </div>
              <div className="font-mono text-[11px] text-ink-3 leading-relaxed">
                {h.sub}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function MailIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
