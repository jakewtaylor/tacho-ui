import { NextResponse } from "next/server";
import { Webhook } from "svix";

import {
  fetchReceivedEmail,
  forwardEmail,
  type InboundWebhookPayload,
} from "@/lib/resend-inbound";

export const runtime = "nodejs";
// Verification depends on the exact raw bytes of the request — Next would
// otherwise be free to cache or reformat the body.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "RESEND_WEBHOOK_SECRET is not configured" },
      { status: 500 },
    );
  }
  const forwardTo = process.env.RESEND_FORWARD_TO;
  const forwardFrom = process.env.RESEND_FORWARD_FROM;
  if (!forwardTo || !forwardFrom) {
    return NextResponse.json(
      { error: "RESEND_FORWARD_TO / RESEND_FORWARD_FROM are not configured" },
      { status: 500 },
    );
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "missing svix headers" },
      { status: 400 },
    );
  }

  const rawBody = await req.text();

  let payload: InboundWebhookPayload;
  try {
    const wh = new Webhook(secret);
    payload = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as InboundWebhookPayload;
  } catch (err) {
    return NextResponse.json(
      { error: "signature verification failed" },
      { status: 400 },
    );
  }

  // We only act on email.received. Future inbound event types are no-ops.
  if (payload.type !== "email.received") {
    return NextResponse.json({ received: true, ignored: payload.type });
  }

  try {
    const email = await fetchReceivedEmail(payload.data.email_id);
    await forwardEmail({
      to: forwardTo,
      from: forwardFrom,
      originalFrom: email.from,
      originalTo: email.to,
      subject: email.subject ?? payload.data.subject ?? "",
      text: email.text ?? null,
      html: email.html ?? null,
    });
    if (email.attachments.length > 0) {
      console.warn(
        `inbound ${email.id} has ${email.attachments.length} attachment(s) — not forwarded yet`,
      );
    }
    return NextResponse.json({ ok: true, forwarded: email.id });
  } catch (err) {
    console.error("inbound forward error", err);
    const message = err instanceof Error ? err.message : "forward failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
