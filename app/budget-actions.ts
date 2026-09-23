"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { encodedRedirect } from "@/utils/utils";
import { UserType } from "@/lib/generated/prisma/client";

/**
 * Annual Budget — spec #12. A reference document only: it doesn't push its
 * numbers back onto any unit's service charge amount, it just records what
 * Rawazen estimates for the year so the OA can see what the budget says
 * needs to be recovered through service charges.
 */

// encodedRedirect always appends "?type=message" itself, so this path must
// stay query-string-free — the year rides along as a path segment instead.
function budgetPath(propertyId: string, year: number): string {
  return `/protected/properties/${propertyId}/budget/${year}`;
}

async function requireOaProperty(propertyId: string) {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { propertyType: { select: { isOwnerAssociation: true } } },
  });
  return property?.propertyType.isOwnerAssociation === true;
}

export const addBudgetIncomeLineAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const propertyId = formData.get("propertyId")?.toString();
  const year = Number(formData.get("year"));
  const description = formData.get("description")?.toString().trim();
  const units = Number(formData.get("units"));
  const amount = Number(formData.get("amount"));

  if (
    !propertyId ||
    !Number.isInteger(year) ||
    !description ||
    !Number.isInteger(units) ||
    units <= 0 ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return encodedRedirect(
      "error",
      propertyId ? budgetPath(propertyId, year) : "/protected/properties",
      "Enter a valid description, number of units, and amount.",
    );
  }

  if (!(await requireOaProperty(propertyId))) {
    return encodedRedirect("error", "/protected/properties", "Annual budget is only available for owner-association properties.");
  }

  const budget = await prisma.annualBudget.upsert({
    where: { propertyId_year: { propertyId, year } },
    create: { propertyId, year },
    update: {},
    select: { id: true },
  });

  await prisma.budgetIncomeLine.create({
    data: {
      budgetId: budget.id,
      description,
      units,
      amount,
      totalYearly: units * amount,
    },
  });

  revalidatePath(budgetPath(propertyId, year));
  return encodedRedirect("success", budgetPath(propertyId, year), "Income line added.");
};

export const deleteBudgetIncomeLineAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const id = formData.get("id")?.toString();
  const propertyId = formData.get("propertyId")?.toString();
  const year = Number(formData.get("year"));
  if (!id || !propertyId) {
    return encodedRedirect("error", "/protected/properties", "Invalid line.");
  }

  if (!(await requireOaProperty(propertyId))) {
    return encodedRedirect("error", "/protected/properties", "Annual budget is only available for owner-association properties.");
  }

  await prisma.budgetIncomeLine.delete({ where: { id } });

  revalidatePath(budgetPath(propertyId, year));
  return encodedRedirect("success", budgetPath(propertyId, year), "Income line removed.");
};

export const addBudgetExpenseLineAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const propertyId = formData.get("propertyId")?.toString();
  const year = Number(formData.get("year"));
  const description = formData.get("description")?.toString().trim();
  const fundId = formData.get("fundId")?.toString() || null;
  const ratePerMonth = Number(formData.get("ratePerMonth"));

  if (
    !propertyId ||
    !Number.isInteger(year) ||
    !description ||
    !Number.isFinite(ratePerMonth) ||
    ratePerMonth <= 0
  ) {
    return encodedRedirect(
      "error",
      propertyId ? budgetPath(propertyId, year) : "/protected/properties",
      "Enter a valid description and monthly rate.",
    );
  }

  if (!(await requireOaProperty(propertyId))) {
    return encodedRedirect("error", "/protected/properties", "Annual budget is only available for owner-association properties.");
  }

  const budget = await prisma.annualBudget.upsert({
    where: { propertyId_year: { propertyId, year } },
    create: { propertyId, year },
    update: {},
    select: { id: true },
  });

  await prisma.budgetExpenseLine.create({
    data: {
      budgetId: budget.id,
      fundId,
      description,
      ratePerMonth,
      ratePerYear: ratePerMonth * 12,
    },
  });

  revalidatePath(budgetPath(propertyId, year));
  return encodedRedirect("success", budgetPath(propertyId, year), "Expense line added.");
};

export const deleteBudgetExpenseLineAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const id = formData.get("id")?.toString();
  const propertyId = formData.get("propertyId")?.toString();
  const year = Number(formData.get("year"));
  if (!id || !propertyId) {
    return encodedRedirect("error", "/protected/properties", "Invalid line.");
  }

  if (!(await requireOaProperty(propertyId))) {
    return encodedRedirect("error", "/protected/properties", "Annual budget is only available for owner-association properties.");
  }

  await prisma.budgetExpenseLine.delete({ where: { id } });

  revalidatePath(budgetPath(propertyId, year));
  return encodedRedirect("success", budgetPath(propertyId, year), "Expense line removed.");
};
