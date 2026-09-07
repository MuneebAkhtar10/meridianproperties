import { headers } from "next/headers";
import QRCode from "qrcode";
import { Download, Info, QrCode } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

/**
 * One QR code for the whole system: it just points at the public
 * /report-issue page. Print it and stick it up anywhere tenants will see
 * it (a lobby noticeboard, each unit's door) — scanning it works with no
 * login at all, since /report-issue identifies the tenant by phone number.
 */
export default async function QrCodePage() {
  await requireRole(UserType.admin);

  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  // Vercel and most reverse proxies set this; falls back to https since
  // that's what production always is, and local dev tolerates the mismatch.
  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  const reportUrl = `${protocol}://${host}/report-issue`;

  const qrDataUrl = await QRCode.toDataURL(reportUrl, {
    width: 480,
    margin: 2,
  });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-8">
      <PageHeader
        title="QR code"
        description="Tenants scan this to report a maintenance issue without signing in — they're matched to their apartment by phone number."
      />

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white">
            <QrCode className="h-4.5 w-4.5" />
          </span>
          <CardTitle className="text-base font-semibold text-white">
            Report-an-issue QR code
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-5 p-8">
          <div className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="QR code linking to the public report-an-issue form"
              className="h-60 w-60 rounded-lg"
            />
          </div>

          <p className="break-all rounded-lg bg-muted/60 px-3 py-1.5 text-center text-xs text-muted-foreground">
            {reportUrl}
          </p>

          <a
            href={qrDataUrl}
            download="report-issue-qr-code.png"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <Download className="h-4 w-4" />
            Download QR code
          </a>

          <div className="flex w-full items-start gap-2.5 rounded-xl border border-[#dc961e]/20 bg-[#dc961e]/10 p-3.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#dc961e]" />
            <p className="text-left text-xs text-[#8a5f13]">
              Only works for phone numbers already on file for a tenant —
              make sure each tenant&apos;s phone number is set correctly
              under People.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
