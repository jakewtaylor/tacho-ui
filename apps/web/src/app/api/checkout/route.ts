import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}

export async function POST() {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return NextResponse.json(
      { error: "STRIPE_PRICE_ID is not configured" },
      { status: 500 },
    );
  }
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      customer_creation: "always",
      success_url: `${baseUrl()}/buy/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl()}/buy/cancel`,
    });
    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL" },
        { status: 502 },
      );
    }
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (err) {
    console.error("checkout error", err);
    const message = err instanceof Error ? err.message : "checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
