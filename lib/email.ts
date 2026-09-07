import "server-only";

/**
 * Thin wrapper around Resend's REST API (no SDK dependency needed — it's a
 * single POST). Until RESEND_API_KEY is set, every call is a no-op that logs
 * a warning once per call instead of throwing, so the rest of the app keeps
 * working with in-app notifications only.
 *
 * Setup:
 *   1. Create a free account at https://resend.com
 *   2. Verify a sending domain (or use Resend's onboarding@resend.dev test
 *      address while developing — it can only send to your own account email).
 *   3. Set these in your .env (and in Vercel's project env vars for production):
 *        RESEND_API_KEY=re_xxxxxxxx
 *        EMAIL_FROM="PropertyCare <notifications@yourdomain.com>"
 */

const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn(
      "[email] RESEND_API_KEY or EMAIL_FROM not set — skipping email to",
      input.to,
    );
    return;
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(
        `[email] Resend request failed (${response.status}) for ${input.to}: ${body}`,
      );
    }
  } catch (error) {
    console.error(`[email] Failed to send to ${input.to}:`, error);
  }
}

type EmailButton = { label: string; href: string };

/** The shared page shell every email renders inside — header, card, footer.
 * `bodyHtml` is trusted, pre-built HTML (every caller in this file escapes
 * user-provided text itself before interpolating it in). Table-based layout +
 * inline styles throughout, since that's what actually renders consistently
 * across Gmail, Outlook, and mobile mail apps — no <style> blocks or
 * flex/grid, which many clients strip or ignore. */
function renderEmailShell(input: {
  title: string;
  preheader: string;
  eyebrow: string;
  bodyHtml: string;
  button?: EmailButton;
  maxWidth?: number;
}): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const buttonHref = input.button
    ? input.button.href.startsWith("http")
      ? input.button.href
      : `${appUrl}${input.button.href}`
    : undefined;

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#eef0f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <!-- Preheader: shown in inbox preview, hidden in the body -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef0f4;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${input.maxWidth ?? 520}px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,0.08);">

            <!-- Header -->
            <tr>
              <td style="background-color:#4338ca;background:linear-gradient(135deg,#4f46e5,#4338ca);padding:26px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:36px;height:36px;background-color:rgba(255,255,255,0.15);border-radius:10px;text-align:center;vertical-align:middle;">
                      <span style="font-size:18px;line-height:36px;">🏠</span>
                    </td>
                    <td style="padding-left:12px;">
                      <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.01em;">PropertyCare</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Accent divider -->
            <tr>
              <td style="height:4px;line-height:4px;font-size:0;background-color:#818cf8;">&nbsp;</td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px 32px 8px;">
                <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6366f1;">${escapeHtml(input.eyebrow)}</p>
                ${input.bodyHtml}
                ${
                  input.button && buttonHref
                    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;">
                        <tr>
                          <td style="border-radius:9px;background-color:#4f46e5;">
                            <a href="${buttonHref}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9px;">${escapeHtml(input.button.label)} →</a>
                          </td>
                        </tr>
                      </table>`
                    : ""
                }
              </td>
            </tr>

            <tr>
              <td style="padding:24px 32px 0;">
                <div style="height:1px;background-color:#eef0f4;line-height:1px;font-size:0;">&nbsp;</div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:20px 32px 28px;">
                <p style="margin:0;font-size:12.5px;line-height:1.6;color:#9ca3af;">You're receiving this because you have an account on PropertyCare. Notification preferences can be managed from your dashboard.</p>
              </td>
            </tr>
          </table>

          <p style="margin:20px 0 0;font-size:12px;color:#a1a5ad;">© ${new Date().getFullYear()} PropertyCare</p>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}

/** A simple label/value detail box — used under a notification's message to
 * spell out the specifics (property, unit, amount, due date, etc.) instead of
 * burying them in a sentence. */
function renderDetailsTable(details: { label: string; value: string }[]): string {
  if (details.length === 0) return "";

  const rows = details
    .map(
      (row, index) => `
        <tr>
          <td style="padding:${index === 0 ? "0" : "10px"} 0 0;font-size:13px;color:#6b7280;width:40%;vertical-align:top;">${escapeHtml(row.label)}</td>
          <td style="padding:${index === 0 ? "0" : "10px"} 0 0;font-size:13px;color:#111827;font-weight:600;text-align:right;vertical-align:top;">${escapeHtml(row.value)}</td>
        </tr>`,
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #f1f2f6;border-radius:10px;padding:16px 18px;margin:4px 0 24px;">
      ${rows}
    </table>`;
}

/** Wraps a notification's title/message (and optional detail rows / button)
 * in the branded shell. This is what every ordinary in-app notification's
 * email uses — see lib/notifications.ts. */
export function renderNotificationEmail(
  title: string,
  message: string,
  href?: string,
  details?: { label: string; value: string }[],
): string {
  const preheader = message.length > 120 ? `${message.slice(0, 117)}...` : message;

  const bodyHtml = `
    <h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;color:#111827;font-weight:700;">${escapeHtml(title)}</h1>
    <p style="margin:0 0 ${details?.length ? "18" : "28"}px;font-size:15px;line-height:1.65;color:#4b5563;">${escapeHtml(message)}</p>
    ${details?.length ? renderDetailsTable(details) : ""}
  `;

  return renderEmailShell({
    title,
    preheader,
    eyebrow: "Notification",
    bodyHtml,
    button: href ? { label: "Open PropertyCare", href } : undefined,
  });
}

/** A proper invoice: line items, subtotal-style total, issue/due dates, and
 * who/where it's billed to. Used for new charges (rent, deposit, utilities,
 * etc.) instead of the generic notification template — see
 * lib/notifications.ts's notifyTenantInvoice. */
export function renderInvoiceEmail(input: {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  tenantName: string;
  propertyName: string;
  unitLabel: string;
  lineItems: { label: string; amount: string }[];
  total: string;
  href: string;
}): string {
  const lineRows = input.lineItems
    .map(
      (item, index) => `
        <tr>
          <td style="padding:${index === 0 ? "0" : "12px"} 0 12px;font-size:14px;color:#374151;border-bottom:1px solid #f1f2f6;">${escapeHtml(item.label)}</td>
          <td style="padding:${index === 0 ? "0" : "12px"} 0 12px;font-size:14px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #f1f2f6;">${escapeHtml(item.amount)}</td>
        </tr>`,
    )
    .join("");

  const bodyHtml = `
    <h1 style="margin:0 0 4px;font-size:21px;line-height:1.3;color:#111827;font-weight:700;">New invoice</h1>
    <p style="margin:0 0 22px;font-size:13px;color:#9ca3af;">Invoice ${escapeHtml(input.invoiceNumber)} · Issued ${escapeHtml(input.issueDate)}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
      <tr>
        <td style="font-size:13px;color:#6b7280;vertical-align:top;width:50%;">
          <p style="margin:0 0 2px;font-weight:700;color:#111827;">Billed to</p>
          <p style="margin:0;">${escapeHtml(input.tenantName)}</p>
        </td>
        <td style="font-size:13px;color:#6b7280;vertical-align:top;text-align:right;">
          <p style="margin:0 0 2px;font-weight:700;color:#111827;">Property</p>
          <p style="margin:0;">${escapeHtml(input.propertyName)}</p>
          <p style="margin:0;">${escapeHtml(input.unitLabel)}</p>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #f1f2f6;border-radius:10px;padding:18px 20px;margin-bottom:8px;">
      ${lineRows}
      <tr>
        <td style="padding:14px 0 0;font-size:14px;color:#111827;font-weight:700;">Total due</td>
        <td style="padding:14px 0 0;font-size:18px;color:#4338ca;font-weight:800;text-align:right;">${escapeHtml(input.total)}</td>
      </tr>
    </table>
    <p style="margin:0 0 26px;font-size:13px;color:#9ca3af;">Due date: <strong style="color:#374151;">${escapeHtml(input.dueDate)}</strong></p>
  `;

  return renderEmailShell({
    title: `New invoice — ${input.total} due ${input.dueDate}`,
    preheader: `New invoice for ${input.propertyName} · ${input.unitLabel}: ${input.total} due ${input.dueDate}.`,
    eyebrow: "Invoice",
    bodyHtml,
    button: { label: "View & Pay in PropertyCare", href: input.href },
    maxWidth: 560,
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
