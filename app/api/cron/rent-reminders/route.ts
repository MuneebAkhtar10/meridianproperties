import { NextRequest, NextResponse } from "next/server";

import { runChequeDateReminders } from "@/lib/cheque-date-reminders";
import { runTenantRentReminders } from "@/lib/tenant-rent-reminders";

/**
 * Daily: tenant rent reminders (1st and 15th only, while unpaid) and
 * post-dated cheque reminders (on the cheque's own date). Same CRON_SECRET
 * protection as the other reminder jobs.
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

  const [tenantRent, cheques] = await Promise.all([
    runTenantRentReminders(),
    runChequeDateReminders(),
  ]);
  return NextResponse.json({ ok: true, tenantRent, cheques });
}
