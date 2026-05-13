import { Resend } from "resend";

let cached: Resend | undefined;

function getResend(): Resend {
  if (!cached) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    cached = new Resend(key);
  }
  return cached;
}

function getFromAddress(): string {
  return process.env.LICENSE_FROM_EMAIL ?? "TachoLens <licenses@tacholens.com>";
}

export type LicenseEmailParams = {
  to: string;
  licenseKey: string;
  updateWindowExpiresAt: Date;
};

export async function sendLicenseEmail(params: LicenseEmailParams): Promise<void> {
  const resend = getResend();
  const formatted = params.updateWindowExpiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const subject = "Your TachoLens license key";
  const text = [
    `Thanks for buying TachoLens.`,
    ``,
    `Your license key:`,
    ``,
    `    ${params.licenseKey}`,
    ``,
    `To activate: open TachoLens → Settings → Enter license key, paste the value above.`,
    ``,
    `This license unlocks every version released up to and including ${formatted}.`,
    `You can keep using those versions forever, even after that date.`,
    ``,
    `Keep this email for your records. Questions: hello@tacholens.com`,
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto;">
      <p>Thanks for buying TachoLens.</p>
      <p>Your license key:</p>
      <pre style="background: #f5f5f4; border-radius: 8px; padding: 16px; font-size: 16px; letter-spacing: 0.05em;">${params.licenseKey}</pre>
      <p>To activate: open TachoLens → Settings → Enter license key, paste the value above.</p>
      <p>This license unlocks every version released up to and including <strong>${formatted}</strong>. You can keep using those versions forever, even after that date.</p>
      <p style="color: #666; font-size: 14px;">Keep this email for your records. Questions: <a href="mailto:hello@tacholens.com">hello@tacholens.com</a></p>
    </div>
  `;
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: params.to,
    subject,
    text,
    html,
  });
  if (error) {
    throw new Error(`Resend error: ${error.message ?? JSON.stringify(error)}`);
  }
}
