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
  const member = await prisma.workerFamilyMember.findUnique({
    where: { id },
    select: {
      workerId: true,
      documentFilePath: true,
      documentFileName: true,
      documentFileType: true,
    },
  });

  if (!member || !member.documentFilePath) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const canRead = user.userType === UserType.admin || member.workerId === user.id;
  if (!canRead) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const file = await downloadAttachment(member.documentFilePath);
    const safeName = (member.documentFileName ?? "document").replace(
      /["\r\n]/g,
      "_",
    );

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": member.documentFileType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Content-Length": String(file.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving family member document:", error);
    return NextResponse.json(
      { error: "File not found in storage" },
      { status: 404 },
    );
  }
}
