import { NextRequest, NextResponse } from "next/server";

import { runRentBillOwnerReminders } from "@/lib/rent-bill-reminders";

/**
 * Daily owner WhatsApp/email alerts for open rent and bill charges.
 * Same CRON_SECRET protection as the other reminder jobs.
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

  const result = await runRentBillOwnerReminders();
  return NextResponse.json({ ok: true, ...result });
}
