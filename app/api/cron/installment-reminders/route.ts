import { NextRequest, NextResponse } from "next/server";

import { runInstallmentReminders } from "@/lib/installment-reminders";

/**
 * Called once a day by Vercel Cron (see vercel.json) to email owners an
 * "installment due soon" invoice a week before each unpaid installment's
 * due date. Same shared-secret auth as
 * app/api/cron/service-charge-reminders/route.ts.
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

  const result = await runInstallmentReminders();
  return NextResponse.json({ ok: true, ...result });
}
