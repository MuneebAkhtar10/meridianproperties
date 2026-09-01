import { headers } from "next/headers";
import QRCode from "qrcode";
import { QrCode } from "lucide-react";

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="h-4 w-4" />
            Report-an-issue QR code
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="QR code linking to the public report-an-issue form"
            className="h-60 w-60 rounded-lg border"
          />

          <p className="break-all text-center text-xs text-muted-foreground">
            {reportUrl}
          </p>

          <a
            href={qrDataUrl}
            download="report-issue-qr-code.png"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Download QR code
          </a>

          <p className="text-center text-xs text-muted-foreground">
            Only works for phone numbers already on file for a tenant — make
            sure each tenant's phone number is set correctly under People.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
