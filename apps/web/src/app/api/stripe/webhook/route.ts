import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getDb, schema } from "@/db";
import { generateLicenseKey, UPDATE_WINDOW_DAYS } from "@/lib/license";
import { sendLicenseEmail } from "@/lib/email";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured" },
      { status: 500 },
    );
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data.object);
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("webhook handler error", err);
    const message = err instanceof Error ? err.message : "handler failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== "payment") return;
  if (session.payment_status !== "paid") return;
  const email = session.customer_details?.email ?? session.customer_email;
  if (!email) {
    throw new Error(`checkout session ${session.id} has no email`);
  }

  const db = getDb();

  const existing = await db
    .select()
    .from(schema.licenses)
    .where(eq(schema.licenses.stripeSessionId, session.id))
    .limit(1);
  if (existing.length > 0) {
    return;
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;

  const key = generateLicenseKey();
  const issuedAt = new Date();
  const updateWindowExpiresAt = new Date(
    issuedAt.getTime() + UPDATE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  await db.insert(schema.licenses).values({
    key,
    email,
    stripeCustomerId: customerId,
    stripeSessionId: session.id,
    issuedAt,
    updateWindowExpiresAt,
  });

  await sendLicenseEmail({
    to: email,
    licenseKey: key,
    updateWindowExpiresAt,
  });
}
