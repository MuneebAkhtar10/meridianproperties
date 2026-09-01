import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { downloadAttachment } from "@/lib/storage";
import { UserType } from "@/lib/generated/prisma/client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const document = await prisma.entityDocument.findUnique({
    where: { id },
    include: {
      tenancy: { select: { tenantId: true } },
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const canRead =
    user.userType === UserType.admin ||
    document.userId === user.id ||
    document.tenancy?.tenantId === user.id;

  if (!canRead) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const file = await downloadAttachment(document.filePath);
    const safeName = document.fileName.replace(/["\r\n]/g, "_");

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": document.fileType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Content-Length": String(file.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving entity document:", error);
    return NextResponse.json(
      { error: "File not found in storage" },
      { status: 404 },
    );
  }
}
