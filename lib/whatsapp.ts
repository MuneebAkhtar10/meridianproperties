import "server-only";

/**
 * Thin wrapper around Meta's WhatsApp Cloud API (plain REST call, no SDK
 * dependency) — this is the number bought directly through Meta Business,
 * not Twilio. Until the env vars are set, every call is a no-op that logs a
 * warning instead of throwing.
 *
 * Setup:
 *   1. In Meta Business Suite / developers.facebook.com, under your WhatsApp
 *      Business app, find:
 *        - the Phone Number ID (not the phone number itself) for the number
 *          you bought
 *        - a permanent access token (create a System User in Business
 *          Settings → System Users, assign it the WhatsApp app, generate a
 *          token with whatsapp_business_messaging permission — the
 *          temporary 24h tokens shown on the app dashboard expire and
 *          shouldn't be used in production)
 *        - the App Secret (App Settings → Basic) for verifying inbound
 *          webhook signatures
 *   2. Set these in your .env (and in Vercel's project env vars for production):
 *        WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxx
 *        WHATSAPP_PHONE_NUMBER_ID=1234567890
 *        WHATSAPP_APP_SECRET=xxxxxxxx
 *        WHATSAPP_VERIFY_TOKEN=<any string you make up>
 *   3. See app/api/whatsapp/webhook/route.ts for the inbound side — that's
 *      where WHATSAPP_VERIFY_TOKEN and WHATSAPP_APP_SECRET get used.
 *   4. Outside the 24-hour customer service window (i.e. the recipient
 *      hasn't messaged you in the last 24h), Meta only delivers pre-approved
 *      Message Templates. Free-form text often returns HTTP 200 and then
 *      fails silently on delivery — so account notices (bills, rent,
 *      service charges) always go out through WHATSAPP_TEMPLATE_GENERIC,
 *      one approved template whose body is a single {{1}} variable filled
 *      with the notice text. Bot replies in app/api/whatsapp/webhook still
 *      use free-form text, because those are inside an open session.
 *      (notifyTenantAssigned in lib/notifications.ts additionally uses its
 *      own richer WHATSAPP_TEMPLATE_TENANT_WELCOME template directly, since
 *      that's almost always a first contact and benefits from real
 *      variables rather than one big paragraph.)
 *      Create the generic template in WhatsApp Manager → Message
 *      Templates: category Utility, with a single {{1}} variable. Meta
 *      rejects a body that's only the variable with no surrounding text,
 *      but the wording matters too — anything that reads as a generic
 *      "you have an update" blurb gets silently reclassified to Marketing
 *      after approval (which then blocks sends to anyone who hasn't opted
 *      in to marketing messages, breaking this exact use case). Word it as
 *      an account/service notification instead, e.g. "PropertyCare account
 *      notification: {{1}} This message relates to your existing tenancy,
 *      maintenance request, or property account." — tying it explicitly to
 *      an existing relationship is what keeps it in Utility. Check the
 *      template's category in WhatsApp Manager after approval, not just its
 *      approval status, since the reclassification can happen after the
 *      fact. Set WHATSAPP_TEMPLATE_GENERIC to its name once approved. This
 *      is the path that matters most for workers specifically: an admin
 *      assigns them a job, so they're a business-initiated recipient almost
 *      every time (they rarely message the bot first) — the free-text send
 *      will routinely hit the 24h-window error and fall back to this
 *      template.
 */

const GRAPH_API_VERSION = "v21.0";

/** Meta's error shape for a rejected send, as far as we care about it. */
type MetaErrorBody = {
  error?: { code?: number; error_subcode?: number; message?: string };
};

/** True when Meta rejected the send specifically because the recipient is
 * outside the 24-hour customer service window (business-initiated message
 * with no approved template) — the one failure this module knows how to
 * recover from automatically, as opposed to a bad token, bad number, etc. */
function isOutsideServiceWindowError(rawBody: string): boolean {
  let parsed: MetaErrorBody;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return false;
  }

  const code = parsed.error?.code;
  const subcode = parsed.error?.error_subcode;
  const message = parsed.error?.message?.toLowerCase() ?? "";

  // 131047 is Meta's documented code for this; 2534022 is the subcode seen
  // in practice on some API versions. The message-text check is a fallback
  // in case Meta changes the exact codes again.
  return (
    code === 131047 ||
    subcode === 2534022 ||
    message.includes("24 hour") ||
    message.includes("re-engagement")
  );
}

export async function sendWhatsApp(input: {
  /** E.164 phone number, e.g. "+96812345678" (already how numbers are stored
   * in this app — see lib/phone.ts). */
  to: string;
  body: string;
  /** True for bills/rent/alerts. Uses the approved generic template so the
   * message still arrives when the recipient has not messaged us in 24h.
   * Leave unset for in-session bot replies. */
  preferTemplate?: boolean;
  /** Body for the generic template if a free-form send is refused (outside
   * the 24h window) — templates can't carry line breaks, so this is the
   * flattened one-liner while `body` may be a multi-line message. */
  fallbackBody?: string;
}): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    console.warn(
      "[whatsapp] WhatsApp Cloud API env vars not set — skipping WhatsApp message to",
      input.to,
    );
    return;
  }

  const genericTemplate = process.env.WHATSAPP_TEMPLATE_GENERIC;
  if (input.preferTemplate && genericTemplate) {
    await sendWhatsAppTemplate({
      to: input.to,
      templateName: genericTemplate,
      bodyParams: [input.body],
    });
    return;
  }

  try {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        // Meta wants the number without the leading "+".
        to: input.to.replace(/^\+/, ""),
        type: "text",
        text: { body: input.body },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");

      if (genericTemplate && isOutsideServiceWindowError(errorBody)) {
        console.warn(
          `[whatsapp] ${input.to} is outside the 24h window — falling back to the generic template.`,
        );
        await sendWhatsAppTemplate({
          to: input.to,
          templateName: genericTemplate,
          bodyParams: [input.fallbackBody ?? input.body],
        });
        return;
      }

      console.error(
        `[whatsapp] Meta Cloud API request failed (${response.status}) for ${input.to}: ${errorBody}`,
      );
    }
  } catch (error) {
    console.error(`[whatsapp] Failed to send to ${input.to}:`, error);
  }
}

/**
 * Sends an approved WhatsApp Message Template instead of free-form text.
 * Required for the very first message to someone who has never texted your
 * business number — see the 24-hour customer-service-window note above.
 * `bodyParams` fill the template's {{1}}, {{2}}, ... placeholders in order,
 * exactly as defined when the template was created in Meta Business
 * Manager (WhatsApp Manager → Message Templates).
 * Default language is `en_US` (what Meta actually publishes for English
 * templates). `en` is retried only if that translation is missing.
 */
function sanitizeTemplateParam(text: string): string {
  const cleaned = text
    .replace(/[\u00A0\u202F\u2007\uFEFF]/g, " ")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/[—–−]/g, "-")
    .replace(/[•·]/g, "-")
    .replace(/[*_~`]/g, "")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, 1024);
  return cleaned.length > 0 ? cleaned : "Account update";
}

function isMissingTemplateLanguage(rawBody: string): boolean {
  try {
    const parsed = JSON.parse(rawBody) as MetaErrorBody & {
      error?: { error_data?: { details?: string } };
    };
    const details = parsed.error?.error_data?.details?.toLowerCase() ?? "";
    return parsed.error?.code === 132001 || details.includes("does not exist in");
  } catch {
    return false;
  }
}

function templateLanguages(preferred?: string): string[] {
  const configured = process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim();
  return [...new Set([preferred, configured, "en_US", "en"].filter(Boolean) as string[])];
}

/** Pieces of one alert, kept apart so each can go on its own line. */
export type WhatsAppAlertParts = {
  title: string;
  message: string;
  details: { label: string; value: string }[];
  closing?: string;
};

/** A properly laid-out chat message — bold title, blank lines between the
 * blocks, one detail per line. Real line breaks only survive in free-form
 * text (Meta strips them from template variables), so this is what's sent
 * inside an open 24-hour window and what the structured template mirrors. */
export function formatWhatsAppText(parts: WhatsAppAlertParts): string {
  const details = parts.details
    .filter((d) => d.value.trim().length > 0)
    .map((d) => `▪️ ${d.label}: *${d.value.trim()}*`);
  return [
    `*${parts.title}*`,
    parts.message,
    details.length ? details.join("\n") : "",
    parts.closing ? `_${parts.closing}_` : "",
  ]
    .filter((block) => block.length > 0)
    .join("\n\n");
}

/**
 * Sends one account alert with the best layout the channel allows:
 *
 *  1. WHATSAPP_TEMPLATE_STRUCTURED set → a multi-variable approved template
 *     whose BODY holds the line breaks and spacing (only the template text
 *     itself may contain newlines, so each variable is one short line):
 *
 *       PropertyCare account notification
 *
 *       {{1}}          <- title
 *
 *       {{2}}          <- message
 *
 *       {{3}}          <- details, one line
 *
 *       {{4}}          <- closing note
 *
 *       This message relates to your existing tenancy, maintenance request,
 *       or property account.
 *
 *  2. Otherwise the original single-variable generic template with the flat
 *     one-line body (unchanged behaviour).
 */
export async function sendWhatsAppAlert(input: {
  to: string;
  parts: WhatsAppAlertParts;
  /** The flat one-line body, used by the generic single-variable template. */
  flatBody: string;
  /** True while the recipient's 24-hour window is open (they messaged us
   * recently): the alert then goes as a properly laid-out multi-line
   * message. Otherwise it must go as an approved template, which Meta
   * delivers regardless. (Meta accepts free-form text outside the window
   * with a 200 and then never delivers it, so we must not guess.) */
  windowOpen?: boolean;
}): Promise<void> {
  if (input.windowOpen) {
    await sendWhatsApp({
      to: input.to,
      body: formatWhatsAppText(input.parts),
      fallbackBody: input.flatBody,
    });
    return;
  }

  const structured = process.env.WHATSAPP_TEMPLATE_STRUCTURED;
  if (structured && process.env.WHATSAPP_ACCESS_TOKEN) {
    const detailsLine = input.parts.details
      .filter((d) => d.value.trim().length > 0)
      .map((d) => `${d.label}: ${d.value.trim()}`)
      .join(" | ");
    await sendWhatsAppTemplate({
      to: input.to,
      templateName: structured,
      bodyParams: [
        input.parts.title,
        input.parts.message,
        detailsLine || "-",
        input.parts.closing || "Thank you.",
      ],
    });
    return;
  }
  await sendWhatsApp({ to: input.to, body: input.flatBody, preferTemplate: true });
}

/**
 * Sends a file (e.g. an invoice PDF) as a WhatsApp document message —
 * uploads it to Meta's media store, then sends it by media id. Documents are
 * free-form messages, so Meta only delivers them inside the recipient's
 * 24-hour window; outside it the request is refused and we just log it (the
 * same PDF always goes by email, and the WhatsApp text carries the summary).
 */
export async function sendWhatsAppDocument(input: {
  to: string;
  filename: string;
  /** Base64 file contents, same shape as an email attachment. */
  contentBase64: string;
  caption?: string;
}): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return;

  try {
    const bytes = Buffer.from(input.contentBase64, "base64");
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", "application/pdf");
    form.append(
      "file",
      new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
      input.filename,
    );

    const upload = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      },
    );
    if (!upload.ok) {
      console.error(
        `[whatsapp] Media upload failed (${upload.status}):`,
        await upload.text().catch(() => ""),
      );
      return;
    }
    const { id } = (await upload.json()) as { id?: string };
    if (!id) return;

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: input.to.replace(/^\+/, ""),
          type: "document",
          document: {
            id,
            filename: input.filename,
            ...(input.caption ? { caption: input.caption } : {}),
          },
        }),
      },
    );
    if (!response.ok) {
      console.warn(
        `[whatsapp] Document to ${input.to} not delivered (${response.status}) — likely outside the 24h window; the PDF is in the email.`,
      );
    }
  } catch (error) {
    console.error(`[whatsapp] Failed to send document to ${input.to}:`, error);
  }
}

export async function sendWhatsAppTemplate(input: {
  to: string;
  templateName: string;
  languageCode?: string;
  bodyParams?: string[];
}): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    console.warn(
      "[whatsapp] WhatsApp Cloud API env vars not set — skipping template message to",
      input.to,
    );
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  const bodyParams = (input.bodyParams ?? []).map(sanitizeTemplateParam);
  const languages = templateLanguages(input.languageCode);

  try {
    for (let i = 0; i < languages.length; i++) {
      const languageCode = languages[i];
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: input.to.replace(/^\+/, ""),
          type: "template",
          template: {
            name: input.templateName,
            language: { code: languageCode },
            ...(bodyParams.length
              ? {
                  components: [
                    {
                      type: "body",
                      parameters: bodyParams.map((text) => ({
                        type: "text",
                        text,
                      })),
                    },
                  ],
                }
              : {}),
          },
        }),
      });

      if (response.ok) return;

      const body = await response.text().catch(() => "");
      if (isMissingTemplateLanguage(body) && i < languages.length - 1) {
        console.warn(
          `[whatsapp] template "${input.templateName}" is not published in ${languageCode} — retrying ${languages[i + 1]}.`,
        );
        continue;
      }

      console.error(
        `[whatsapp] Meta Cloud API template request failed (${response.status}) for ${input.to}: ${body}`,
      );
      return;
    }
  } catch (error) {
    console.error(`[whatsapp] Failed to send template to ${input.to}:`, error);
  }
}

/**
 * Downloads a photo/file a user sent on WhatsApp — used for the worker's
 * "photo of the finished work" step (see lib/whatsapp-bot.ts). Meta's inbound
 * media isn't a plain URL: the webhook payload only carries a media *id*,
 * which has to be exchanged for a short-lived download URL first (both
 * calls need the same access token — the download URL isn't public on its
 * own). Returns null on any failure so a bad/expired media id never crashes
 * the conversation.
 */
export async function downloadWhatsappMedia(
  mediaId: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    console.warn("[whatsapp] WHATSAPP_ACCESS_TOKEN not set — cannot download media");
    return null;
  }

  try {
    const metaResponse = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!metaResponse.ok) {
      console.error(
        `[whatsapp] Media lookup failed (${metaResponse.status}) for ${mediaId}`,
      );
      return null;
    }

    const meta = (await metaResponse.json()) as {
      url?: string;
      mime_type?: string;
    };

    if (!meta.url) {
      console.error(`[whatsapp] Media lookup for ${mediaId} had no url`);
      return null;
    }

    // The download URL itself also requires the same bearer token — it's
    // not a public link.
    const fileResponse = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!fileResponse.ok) {
      console.error(
        `[whatsapp] Media download failed (${fileResponse.status}) for ${mediaId}`,
      );
      return null;
    }

    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    return { buffer, mimeType: meta.mime_type ?? "application/octet-stream" };
  } catch (error) {
    console.error(`[whatsapp] Failed to download media ${mediaId}:`, error);
    return null;
  }
}
