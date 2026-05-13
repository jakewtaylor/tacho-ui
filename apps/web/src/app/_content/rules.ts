/**
 * EU 561/2006 rules that the engine implements. Codes match the ones
 * emitted by apps/desktop/frontend/src/infringements.ts — keep them in
 * sync when the engine adds or removes rules.
 */

export type RuleScope = "day" | "week";

export type Rule = {
  code: string;
  scope: RuleScope;
  rule: string;
  ref: string;
};

export const rules: Rule[] = [
  {
    code: "CONTINUOUS_DRIVING",
    scope: "day",
    rule: "Driving > 4 h 30 m without a qualifying 45-min break",
    ref: "Art. 7",
  },
  {
    code: "DAILY_DRIVING_HARD",
    scope: "day",
    rule: "Daily driving exceeds the 10-hour hard ceiling",
    ref: "Art. 6(1)",
  },
  {
    code: "DAILY_DRIVING_EXTENDED",
    scope: "day",
    rule: "Driving 9–10 h consumes one of two weekly extensions",
    ref: "Art. 6(1)",
  },
  {
    code: "DAILY_REST_INSUFFICIENT",
    scope: "day",
    rule: "Pre-shift rest below 9 hours",
    ref: "Art. 8",
  },
  {
    code: "DAILY_REST_REDUCED",
    scope: "day",
    rule: "Pre-shift rest 9–11 h — counted against weekly cap",
    ref: "Art. 8",
  },
  {
    code: "WEEKLY_DRIVING",
    scope: "week",
    rule: "Weekly driving exceeds 56 hours",
    ref: "Art. 6(2)",
  },
  {
    code: "FORTNIGHTLY_DRIVING",
    scope: "week",
    rule: "Two-week driving total exceeds 90 hours",
    ref: "Art. 6(3)",
  },
  {
    code: "TOO_MANY_EXTENSIONS",
    scope: "week",
    rule: "More than two 9–10 h days used in a Sun-Sat bucket",
    ref: "Art. 6(1)",
  },
  {
    code: "TOO_MANY_REDUCED_RESTS",
    scope: "week",
    rule: "More than three reduced daily rests in a week",
    ref: "Art. 8",
  },
  {
    code: "WEEKLY_REST_MISSING",
    scope: "week",
    rule: "No qualifying ≥ 24 h rest overlaps the week",
    ref: "Art. 8(6)",
  },
  {
    code: "WEEKLY_REST_REDUCED",
    scope: "week",
    rule: "Longest weekly rest 24–45 h — reduced rest used",
    ref: "Art. 8(6)",
  },
  {
    code: "WEEKLY_REST_INCONCLUSIVE",
    scope: "week",
    rule: "Card-not-inserted gap could plausibly contain rest",
    ref: "—",
  },
];
