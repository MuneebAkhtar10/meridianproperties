import "server-only";
import { request } from "node:https";

/**
 * Gemini helpers for the WhatsApp integration. Both functions are
 * best-effort: they return null on any failure (missing key, network
 * error, empty response) so callers always have a plain-text fallback
 * ready — a bad AI response should never block a notification or leave an
 * inbound message unanswered.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_HOST = "generativelanguage.googleapis.com";

/**
 * Plain `https.request` instead of the global `fetch`: on networks with
 * broken/slow IPv6 routing to Google, fetch's Happy-Eyeballs connection
 * logic can stall for the full dual-stack timeout before ever trying IPv4.
 * Passing `family: 4` here skips that entirely and dials IPv4 directly.
 */
function postJson(
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request(
      {
        host: GEMINI_HOST,
        path,
        method: "POST",
        family: 4,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: data }),
        );
      },
    );

    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function callGemini(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const { status, body } = await postJson(
      `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 200 },
      },
      15000,
    );

    if (status < 200 || status >= 300) {
      console.error(`[gemini] request failed (${status}): ${body}`);
      return null;
    }

    const data = JSON.parse(body);
    const candidate = data?.candidates?.[0];
    const text: string | undefined = candidate?.content?.parts?.[0]?.text;
    const trimmed = text?.trim();

    if (!trimmed) return null;

    // A truncated response (cut off by maxOutputTokens) or one with no
    // actual words (e.g. a bare number) is worse than no AI text at all —
    // better to fall back to the plain-text message than send that to a
    // tenant or worker.
    if (candidate?.finishReason === "MAX_TOKENS") {
      console.error("[gemini] Response was truncated, discarding:", trimmed);
      return null;
    }
    if (!/[a-zA-Z]{3,}/.test(trimmed)) {
      console.error("[gemini] Response has no real words, discarding:", trimmed);
      return null;
    }

    return trimmed;
  } catch (error) {
    console.error("[gemini] Request failed:", error);
    return null;
  }
}

/** Turns a structured in-app notification into a short, natural WhatsApp
 * message (used for outbound alerts like "worker assigned"). */
export async function generateWhatsAppMessage(input: {
  title: string;
  message: string;
  details?: { label: string; value: string }[];
}): Promise<string | null> {
  const detailLines = input.details
    ?.map((d) => `${d.label}: ${d.value}`)
    .join("\n");

  const prompt = `You write short WhatsApp notifications for a property management app (tenants and maintenance workers read these on their phones).

Rewrite the notification below as a single WhatsApp message: 1-3 short sentences, plain text, friendly and direct, no markdown headers or bullet lists (WhatsApp *bold* is fine if it helps one key word). Only use facts given below — never invent details. Output only the message text, nothing else.

Title: ${input.title}
Message: ${input.message}
${detailLines ? `Details:\n${detailLines}` : ""}`;

  return callGemini(prompt);
}

/**
 * Drafts a reply to an inbound WhatsApp message that didn't match any of
 * the bot's recognized commands (a menu number, "1"/"done", a completion
 * code, etc.) — see lib/whatsapp-bot.ts. Only ever used for the fallback
 * case; anything that changes a request/task's status is handled by fixed
 * business logic before this is ever called, never by the model.
 */
export async function generateFreeformReply(input: {
  /** Who's texting, so the tone and available actions make sense. */
  role: "tenant" | "worker";
  /** What they actually sent. */
  userMessage: string;
  /** Short plain-English facts about their current situation (open
   * requests, active job and its status, etc.) — only these facts may be
   * used in the reply, nothing invented. */
  context: string;
  /** The valid commands to steer them back to if relevant. */
  validCommands: string;
}): Promise<string | null> {
  const prompt = `You are a WhatsApp assistant for a property management app called PropertyCare. You're replying to a ${input.role} who just texted the business number. This is a simple menu-driven bot, not a general chatbot — it only understands specific commands.

Their situation right now (only use these facts, never invent anything else):
${input.context}

Valid commands they can send: ${input.validCommands}

They wrote: "${input.userMessage}"

Reply in 1-2 short sentences, friendly and plain text (no markdown headers or lists). Acknowledge what they said if relevant, then remind them of the exact valid command(s) they should use. Do not promise any action you can't confirm from the facts above (e.g. don't say "I've notified the worker" — you can't do that). Output only the reply text, nothing else.`;

  return callGemini(prompt);
}
