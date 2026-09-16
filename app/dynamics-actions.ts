"use server";

import { revalidatePath } from "next/cache";

import { syncAllApprovedPayments } from "@/lib/dynamics/sync";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

/** Push every approved payment that isn't in Dynamics yet — the manual catch-up next to auto-sync-on-approval. */
export async function syncAllPaymentsAction() {
  await requireRole(UserType.admin);
  const results = await syncAllApprovedPayments();
  revalidatePath("/protected/admin/dynamics");
  return {
    total: results.length,
    created: results.filter((r) => !r.skipped && !r.error).length,
    alreadySynced: results.filter((r) => r.skipped).length,
    failed: results.filter((r) => r.error).length,
  };
}
