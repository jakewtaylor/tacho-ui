// Tiny client that fetches the license price straight from Stripe's REST API.
// We use raw fetch (not the SDK) so we can hand Next.js a `revalidate` hint —
// the Stripe Node SDK uses its own HTTP client and would bypass Next's cache.

type StripePrice = {
  id: string;
  unit_amount: number | null;
  currency: string; // ISO-4217, lowercase from Stripe
  type: "one_time" | "recurring";
  recurring: { interval: string } | null;
};

export type PriceInfo = {
  /** "£49" or "$60" — major-unit only, no decimals for whole amounts. */
  formatted: string;
  /** Major-unit amount as a number (e.g. 49 for £49). */
  amount: number;
  /** Lowercase ISO-4217 from Stripe. */
  currency: string;
  /** True if `recurring` is set on the Stripe Price. */
  recurring: boolean;
};

const cache: { value: PriceInfo | null; expiresAt: number } = {
  value: null,
  expiresAt: 0,
};

async function fetchPrice(priceId: string): Promise<StripePrice> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not set");
  const res = await fetch(`https://api.stripe.com/v1/prices/${priceId}`, {
    headers: { Authorization: `Bearer ${secret}` },
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`Stripe price ${priceId}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function format(price: StripePrice): PriceInfo {
  const major = (price.unit_amount ?? 0) / 100;
  const formatter = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return {
    formatted: formatter.format(major),
    amount: major,
    currency: price.currency,
    recurring: price.type === "recurring",
  };
}

/**
 * Returns the formatted price string for the configured Stripe Price, or
 * `null` if the price isn't available (no env var, API failure, missing
 * unit_amount). Callers are expected to fall back to a generic label.
 */
export async function getPriceInfo(): Promise<PriceInfo | null> {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) return null;

  // Module-level memoization on top of Next's fetch cache. Cheap re-renders
  // within the same process share the formatted value without re-running the
  // Intl formatter or re-parsing the JSON response.
  const now = Date.now();
  if (cache.value && now < cache.expiresAt) {
    return cache.value;
  }
  try {
    const price = await fetchPrice(priceId);
    const info = format(price);
    cache.value = info;
    cache.expiresAt = now + 60 * 60 * 1000;
    return info;
  } catch (err) {
    console.error("getPriceInfo failed", err);
    return null;
  }
}
