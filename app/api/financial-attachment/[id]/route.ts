import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { downloadAttachment } from "@/lib/storage";
import { UserType } from "@/lib/generated/prisma/client";

/** Bills and receipts stay private to the tenant concerned and administrators. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const attachment = await prisma.financialAttachment.findUnique({
    where: { id },
    include: {
      charge: { select: { tenantId: true } },
      payment: { include: { charge: { select: { tenantId: true } } } },
    },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const tenantId =
    attachment.charge?.tenantId ?? attachment.payment?.charge.tenantId;
  if (user.userType !== UserType.admin && tenantId !== user.id) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const file = await downloadAttachment(attachment.filePath);
    const safeName = attachment.fileName.replace(/["\r\n]/g, "_");

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": attachment.fileType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Content-Length": String(file.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving financial document:", error);
    return NextResponse.json(
      { error: "File not found in storage" },
      { status: 404 },
    );
  }
}
