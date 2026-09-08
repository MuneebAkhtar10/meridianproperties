import { createHmac, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { handleIncomingWhatsapp, normalizeWhatsappPhone } from "@/lib/whatsapp-bot";
import { sendWhatsApp } from "@/lib/whatsapp";

/**
 * Meta calls this for two different things (same URL for both):
 *
 *  - GET: the one-time webhook verification handshake when you register
 *    this URL in Meta's App Dashboard → WhatsApp → Configuration →
 *    Webhook. Meta sends hub.mode/hub.verify_token/hub.challenge; we echo
 *    back hub.challenge if the verify token matches WHATSAPP_VERIFY_TOKEN.
 *
 *  - POST: every inbound WhatsApp message (tenants reporting issues,
 *    workers replying to their tasks — see lib/whatsapp-bot.ts for the
 *    actual conversation logic) and delivery/status updates, which we
 *    ignore.
 *
 * Meta's webhook payloads: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

function isValidMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader) return false;

  const expected =
    "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signatureHeader);

  return (
    expectedBuf.length === providedBuf.length &&
    timingSafeEqual(expectedBuf, providedBuf)
  );
}

type WhatsappWebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        messages?: {
          from?: string;
          type?: string;
          text?: { body?: string };
          interactive?: {
            button_reply?: { id?: string; title?: string };
            list_reply?: { id?: string; title?: string };
          };
        }[];
      };
    }[];
  }[];
};

/**
 * Meta only accepts one callback URL per app subscription, so there's no
 * way to register both a local (ngrok) and live URL with Meta at once. This
 * is the workaround: the live webhook — the one actually registered — fans
 * out a copy of every raw payload to a second URL (your ngrok tunnel) for
 * local observation. Best-effort: a slow or dead mirror target is swallowed
 * and never breaks handling the live request, since only production ever
 * replies to WhatsApp. Deliberately awaited (not true fire-and-forget) —
 * on Vercel, a serverless function can freeze the instant it returns its
 * response, killing any promise still in flight, so this has to finish
 * before POST returns. Capped at 4s so a dead mirror (e.g. ngrok not
 * running) can't meaningfully delay the real response Meta is waiting on.
 * Unset (or leave WHATSAPP_WEBHOOK_MIRROR_URL empty) to disable.
 */
async function mirrorWebhookPayload(
  rawBody: string,
  headers: Headers,
): Promise<void> {
  const mirrorUrl = process.env.WHATSAPP_WEBHOOK_MIRROR_URL;
  if (!mirrorUrl) return;

  try {
    await fetch(mirrorUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": headers.get("X-Hub-Signature-256") ?? "",
      },
      body: rawBody,
      signal: AbortSignal.timeout(4000),
    });
  } catch (error) {
    console.warn("[whatsapp webhook] Mirror send failed (non-fatal):", error);
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  await mirrorWebhookPayload(rawBody, request.headers);

  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (appSecret) {
    const signature = request.headers.get("X-Hub-Signature-256");

    if (!isValidMetaSignature(rawBody, signature, appSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
  } else {
    console.warn(
      "[whatsapp webhook] WHATSAPP_APP_SECRET not set — skipping signature verification",
    );
  }

  let payload: WhatsappWebhookPayload;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  // Meta also posts status updates (sent/delivered/read) and other event
  // types to this same webhook with no `messages` array — nothing to do.
  if (!message?.from) {
    return NextResponse.json({ ok: true });
  }

  const body =
    message.text?.body ??
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title ??
    "";

  const from = normalizeWhatsappPhone(message.from);

  try {
    const reply = await handleIncomingWhatsapp(message.from, body);
    // Unlike Twilio's TwiML, Meta's webhook response body is ignored — a
    // reply has to be sent back out as its own API call.
    await sendWhatsApp({ to: from, body: reply });
  } catch (error) {
    console.error("[whatsapp webhook] Failed to handle message:", error);
    await sendWhatsApp({
      to: from,
      body: "Sorry, something went wrong on our end. Please try again shortly.",
    }).catch(() => {});
  }

  // Meta expects a fast 200 regardless of what we did with the message —
  // it retries on non-200s, which would just resend the same message.
  return NextResponse.json({ ok: true });
}
