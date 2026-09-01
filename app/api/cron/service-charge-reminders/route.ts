import { NextRequest, NextResponse } from "next/server";

import { runServiceChargeReminders } from "@/lib/service-charge-reminders";

/**
 * Called once a day by Vercel Cron (see vercel.json) to send service-charge
 * reminder notifications. Protected by a shared secret rather than a user
 * session, since there's no logged-in user calling it.
 *
 * Set CRON_SECRET in your environment variables, matching what's configured
 * for the cron job (Vercel sends it automatically as a Bearer token when
 * CRON_SECRET is set on the project — see Vercel's Cron Jobs docs).
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

  const result = await runServiceChargeReminders();
  return NextResponse.json({ ok: true, ...result });
}
