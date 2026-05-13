export type Step = {
  n: string;
  title: string;
  body: string;
  mono: string;
};

export const steps: Step[] = [
  {
    n: "01",
    title: "Drop in a .ddd file",
    body: "Pull the driver-card download off your tachograph reader the way you always do. TachoLens accepts drag-and-drop or a standard file dialog.",
    mono: "card files and vehicle units",
  },
  {
    n: "02",
    title: "Parsed on your Mac, in a moment",
    body: "Imports happen locally — no upload, no waiting on a server. Re-importing the same file is a no-op; the history accumulates as you drop in new ones.",
    mono: "everything stays on your machine",
  },
  {
    n: "03",
    title: "Read your weeks at a glance",
    body: "Per-day breakdown of driving, work, available time, and rest. Patterns that may point to EU 561/2006 issues are flagged for you to review against the regulation and your raw records. Weekly summaries print cleanly to A4.",
    mono: "first-look summaries you verify",
  },
];
