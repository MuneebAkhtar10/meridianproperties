import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaffAdmin } from "@/lib/session";
import { downloadAttachment } from "@/lib/storage";
import { UserType } from "@/lib/generated/prisma/client";

/** A building service contract's signed copy — an internal record, admin only. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !isStaffAdmin(user.userType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const contract = await prisma.buildingServiceContract.findUnique({
    where: { id },
  });

  if (!contract || !contract.documentFilePath) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  try {
    const file = await downloadAttachment(contract.documentFilePath);
    const safeName = (contract.documentFileName ?? "contract").replace(
      /["\r\n]/g,
      "_",
    );

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": contract.documentFileType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Content-Length": String(file.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving building contract document:", error);
    return NextResponse.json(
      { error: "File not found in storage" },
      { status: 404 },
    );
  }
}
