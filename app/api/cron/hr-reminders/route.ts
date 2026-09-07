import { NextRequest, NextResponse } from "next/server";

import { runHrReminders } from "@/lib/hr-reminders";

/**
 * Called once a day by Vercel Cron (see vercel.json) to send HR
 * document-expiry reminders (passport, visa, Civil ID, car insurance) for
 * in-house workers. Protected by the same shared secret as the
 * service-charge reminder cron — see that route for the setup note.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const provided =
    authHeader?.replace(/^Bearer\s+/i, "") ??
    request.nextUrl.searchParams.get("secret");

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runHrReminders();
  return NextResponse.json({ ok: true, ...result });
}
