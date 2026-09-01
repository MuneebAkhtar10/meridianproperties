import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/session";
import { ensureBucket, getBucket } from "@/lib/storage";
import { UserType } from "@/lib/generated/prisma/client";

/** Admin-triggered creation of the storage bucket. Safe to run more than once. */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.userType !== UserType.admin) {
    return NextResponse.json(
      { error: "Forbidden - Admin access required" },
      { status: 403 },
    );
  }

  try {
    await ensureBucket();

    return NextResponse.json({
      success: true,
      message: `Bucket "${getBucket()}" is ready.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error initializing storage:", message);

    return NextResponse.json(
      { error: `Failed to initialize storage: ${message}` },
      { status: 500 },
    );
  }
}
