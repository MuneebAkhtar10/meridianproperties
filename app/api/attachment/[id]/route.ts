import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { downloadAttachment } from "@/lib/storage";
import { UserType } from "@/lib/generated/prisma/client";

/**
 * The only way to read a file out of the bucket.
 *
 * The bucket is private, so this route is where attachment access is decided:
 * you may read one if you raised the request, you are an admin, or you are the
 * worker assigned to it.
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

  const attachment = await prisma.maintenanceAttachment.findUnique({
    where: { id },
    include: {
      request: { select: { userId: true, assignedToId: true } },
    },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const isOwner = attachment.request.userId === user.id;
  const isAdmin = user.userType === UserType.admin;
  const isAssignedWorker =
    user.userType === UserType.worker &&
    attachment.request.assignedToId === user.id;

  if (!isOwner && !isAdmin && !isAssignedWorker) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const file = await downloadAttachment(attachment.filePath);

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": attachment.fileType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${attachment.fileName}"`,
        "Content-Length": String(file.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving attachment:", error);
    return NextResponse.json(
      { error: "File not found in storage" },
      { status: 404 },
    );
  }
}
