// Client helpers for Resend's inbound-email feature. The inbound webhook
// payload itself only carries metadata (email_id, from, to, subject,
// attachment list); the body has to be fetched separately, and forwarding
// happens through the normal send API.
//
// Docs:
//   - https://resend.com/docs/webhooks/emails/received
//   - https://resend.com/docs/api-reference/emails/retrieve-received-email

const API_BASE = "https://api.resend.com";

export type InboundAttachmentMeta = {
  id: string;
  filename: string;
  content_type: string;
  content_disposition: string | null;
  content_id: string | null;
};

export type InboundWebhookPayload = {
  type: "email.received" | string;
  created_at: string;
  data: {
    email_id: string;
    created_at: string;
    from: string;
    to: string[];
    cc: string[];
    bcc: string[];
    message_id: string;
    subject: string;
    attachments: InboundAttachmentMeta[];
  };
};

export type ReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  reply_to?: string[];
  subject: string;
  text: string | null;
  html: string | null;
  created_at: string;
  message_id: string;
  headers?: Record<string, string>;
  attachments: InboundAttachmentMeta[];
  raw?: { download_url: string; expires_at: string };
};

function authHeaders(): HeadersInit {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/** GET /emails/receiving/{id} — full email body + headers. */
export async function fetchReceivedEmail(id: string): Promise<ReceivedEmail> {
  const res = await fetch(`${API_BASE}/emails/receiving/${id}`, {
    headers: authHeaders(),
    // Inbound is one-shot per email; no caching.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend GET /emails/receiving/${id}: ${res.status} ${body}`);
  }
  return res.json();
}

export type ForwardParams = {
  to: string | string[];
  from: string;
  /** Original sender — included in the rewritten subject + body so it isn't lost. */
  originalFrom: string;
  /** Recipients the inbound mail was addressed to (info-only — we forward to `to`). */
  originalTo: string[];
  subject: string;
  text: string | null;
  html: string | null;
};

/**
 * Forwards a received email via Resend's send API. The forwarded message
 * surfaces the original sender at the top of the body since `from` must be a
 * verified-domain address on our Resend account, not the original sender.
 */
export async function forwardEmail(params: ForwardParams): Promise<{ id: string }> {
  const headerLines = [
    `From: ${escapeHtml(params.originalFrom)}`,
    `To: ${escapeHtml(params.originalTo.join(", "))}`,
    `Subject: ${escapeHtml(params.subject)}`,
  ];

  const html =
    `<div style="font-family: -apple-system, system-ui, sans-serif; color: #444; font-size: 13px; border-bottom: 1px solid #eee; padding-bottom: 12px; margin-bottom: 16px;">` +
    `<strong>Forwarded message from TachoLens</strong><br/>` +
    headerLines.map((l) => `<span style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;">${l}</span>`).join("<br/>") +
    `</div>` +
    (params.html ?? `<pre style="white-space: pre-wrap;">${escapeHtml(params.text ?? "")}</pre>`);

  const text =
    [
      "---------- Forwarded message ----------",
      `From: ${params.originalFrom}`,
      `To: ${params.originalTo.join(", ")}`,
      `Subject: ${params.subject}`,
      "",
      params.text ?? "(no plain-text body)",
    ].join("\n");

  const res = await fetch(`${API_BASE}/emails`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      from: params.from,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: `Fwd: ${params.subject || "(no subject)"}`,
      text,
      html,
      reply_to: params.originalFrom,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend POST /emails: ${res.status} ${body}`);
  }
  return res.json();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
