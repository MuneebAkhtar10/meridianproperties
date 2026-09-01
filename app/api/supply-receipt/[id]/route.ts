import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { downloadAttachment } from "@/lib/storage";
import { UserType } from "@/lib/generated/prisma/client";

/**
 * Serves a supply request's purchase receipt. Private, like every other
 * upload in this app — only the admin, the worker who requested the item,
 * or the worker currently assigned to the job can view it.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supplyRequest = await prisma.supplyRequest.findUnique({
    where: { id },
    include: {
      request: { select: { assignedToId: true } },
    },
  });

  if (!supplyRequest || !supplyRequest.receiptPath) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  const canRead =
    user.userType === UserType.admin ||
    supplyRequest.requestedById === user.id ||
    supplyRequest.request.assignedToId === user.id;

  if (!canRead) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const file = await downloadAttachment(supplyRequest.receiptPath);
    const safeName = (supplyRequest.receiptFileName ?? "receipt").replace(
      /["\r\n]/g,
      "_",
    );

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": supplyRequest.receiptFileType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Content-Length": String(file.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving supply receipt:", error);
    return NextResponse.json(
      { error: "File not found in storage" },
      { status: 404 },
    );
  }
}
