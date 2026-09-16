import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

/// Admin-manageable categories and their per-category types — see the
/// "Expense Types" tab on /protected/expenses. Replaces what used to be a
/// fixed enum + hardcoded subcategory lists, so the client can grow their
/// own chart of accounts without a code change.
export async function getExpenseCategoriesWithSubcategories() {
  return prisma.expenseCategoryType.findMany({
    orderBy: { createdAt: "asc" },
    include: { subcategories: { orderBy: { createdAt: "asc" } } },
  });
}

export type ExpenseCategoryWithSubcategories = Awaited<
  ReturnType<typeof getExpenseCategoriesWithSubcategories>
>[number];

/// Active vendors, which expense categories they cover ("services
/// covered"), and which properties they're eligible for — used to filter
/// the Supplier picker in the expense form down to only vendors who both
/// do that kind of work AND serve the property the expense is against.
/// Inactive suppliers are excluded here but still show on past expenses
/// that reference them. `propertyIds: null` means "all properties."
export async function getActiveSuppliersWithCategories() {
  const suppliers = await prisma.supplier.findMany({
    where: { active: true },
    orderBy: { companyName: "asc" },
    include: {
      categories: { select: { categoryId: true } },
      properties: { select: { propertyId: true } },
    },
  });

  return suppliers.map((supplier) => ({
    id: supplier.id,
    companyName: supplier.companyName,
    categoryIds: supplier.categories.map((c) => c.categoryId),
    propertyIds: supplier.availableForAllProperties
      ? null
      : supplier.properties.map((p) => p.propertyId),
  }));
}

/// Shared between the Expenses page and its CSV/PDF export routes so they
/// never drift apart — "download what I'm looking at" only holds if both
/// build the exact same `where` from the same query params.
export function buildExpenseWhere(filters: {
  category?: string;
  property?: string;
  year?: string;
}): Prisma.ExpenseWhereInput {
  const where: Prisma.ExpenseWhereInput = {};

  if (filters.category && filters.category !== "all") {
    where.categoryId = filters.category;
  }
  if (filters.property && filters.property !== "all") {
    where.OR = [
      { propertyId: filters.property },
      { units: { some: { unit: { propertyId: filters.property } } } },
    ];
  }
  if (filters.year && filters.year !== "all") {
    const year = Number(filters.year);
    where.date = {
      gte: new Date(Date.UTC(year, 0, 1)),
      lt: new Date(Date.UTC(year + 1, 0, 1)),
    };
  }

  return where;
}
