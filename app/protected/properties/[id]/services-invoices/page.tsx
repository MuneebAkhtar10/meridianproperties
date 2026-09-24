import { redirect } from "next/navigation";

import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

/** There is one Invoices section for the whole system — this old
 * per-property list now opens it filtered to this property. */
export default async function ServicesInvoicesPage({ params }: PageProps) {
  await requireRole(UserType.admin);
  const { id } = (await params) as { id: string };
  redirect(`/protected/invoices?property=${id}&bucket=all`);
}
