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
 *      hasn't messaged you in the last 24h), Meta only allows pre-approved
 *      Message Templates, not free-form text like this. sendWhatsApp below
 *      already handles this automatically: it tries free-form text first
 *      (works whenever the recipient has messaged recently), and only if
 *      Meta rejects it specifically for being outside that window does it
 *      fall back to WHATSAPP_TEMPLATE_GENERIC — one approved template whose
 *      entire body is a single {{1}} variable, filled with this same
 *      message text. That one template covers every notification type in
 *      the app; you never need to create a new template per situation.
 *      (notifyTenantAssigned in lib/notifications.ts additionally uses its
 *      own richer WHATSAPP_TEMPLATE_TENANT_WELCOME template directly, since
 *      that's almost always a first contact and benefits from real
 *      variables rather than one big paragraph.)
 *      Create the generic template in WhatsApp Manager → Message
 *      Templates: category Utility, body exactly `{{1}}` (nothing else),
 *      and set WHATSAPP_TEMPLATE_GENERIC to its name once approved.
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

      const genericTemplate = process.env.WHATSAPP_TEMPLATE_GENERIC;
      if (genericTemplate && isOutsideServiceWindowError(errorBody)) {
        console.warn(
          `[whatsapp] ${input.to} is outside the 24h window — falling back to the generic template.`,
        );
        await sendWhatsAppTemplate({
          to: input.to,
          templateName: genericTemplate,
          bodyParams: [input.body],
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
 */
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
        to: input.to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: input.templateName,
          language: { code: input.languageCode ?? "en" },
          ...(input.bodyParams?.length
            ? {
                components: [
                  {
                    type: "body",
                    parameters: input.bodyParams.map((text) => ({
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

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(
        `[whatsapp] Meta Cloud API template request failed (${response.status}) for ${input.to}: ${body}`,
      );
    }
  } catch (error) {
    console.error(`[whatsapp] Failed to send template to ${input.to}:`, error);
  }
}
