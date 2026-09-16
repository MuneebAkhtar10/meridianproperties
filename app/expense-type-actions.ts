"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { encodedRedirect } from "@/utils/utils";
import { UserType } from "@/lib/generated/prisma/client";

const EXPENSE_TYPES_PATH = "/protected/expenses?tab=types";

/** Same slugify used for property types (app/admin-actions.ts) — a stable
 * lowercase/underscore key derived from the label. */
function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const createExpenseCategoryAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const label = formData.get("label")?.toString().trim();
  if (!label) {
    return encodedRedirect("error", EXPENSE_TYPES_PATH, "Enter a category name.");
  }

  const name = slugify(label);
  if (!name) {
    return encodedRedirect("error", EXPENSE_TYPES_PATH, "Enter a valid category name.");
  }

  const existing = await prisma.expenseCategoryType.findUnique({
    where: { name },
  });
  if (existing) {
    return encodedRedirect(
      "error",
      EXPENSE_TYPES_PATH,
      "A category with that name already exists.",
    );
  }

  await prisma.expenseCategoryType.create({ data: { name, label } });

  revalidatePath(EXPENSE_TYPES_PATH);
  return encodedRedirect("success", EXPENSE_TYPES_PATH, "Category added.");
};

export const deleteExpenseCategoryAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const categoryId = formData.get("categoryId")?.toString();
  if (!categoryId) {
    return encodedRedirect("error", EXPENSE_TYPES_PATH, "Invalid category.");
  }

  const inUse = await prisma.expense.count({ where: { categoryId } });
  if (inUse > 0) {
    return encodedRedirect(
      "error",
      EXPENSE_TYPES_PATH,
      `Cannot delete: ${inUse} expense${inUse === 1 ? "" : "s"} still use this category.`,
    );
  }

  await prisma.expenseCategoryType.delete({ where: { id: categoryId } });

  revalidatePath(EXPENSE_TYPES_PATH);
  return encodedRedirect("success", EXPENSE_TYPES_PATH, "Category deleted.");
};

export const createExpenseSubcategoryAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const categoryId = formData.get("categoryId")?.toString();
  const label = formData.get("label")?.toString().trim();

  if (!categoryId || !label) {
    return encodedRedirect("error", EXPENSE_TYPES_PATH, "Enter a type name.");
  }

  const category = await prisma.expenseCategoryType.findUnique({
    where: { id: categoryId },
  });
  if (!category) {
    return encodedRedirect("error", EXPENSE_TYPES_PATH, "Category not found.");
  }

  const existing = await prisma.expenseSubcategoryType.findUnique({
    where: { categoryId_label: { categoryId, label } },
  });
  if (existing) {
    return encodedRedirect(
      "error",
      EXPENSE_TYPES_PATH,
      `"${label}" already exists under ${category.label}.`,
    );
  }

  await prisma.expenseSubcategoryType.create({ data: { categoryId, label } });

  revalidatePath(EXPENSE_TYPES_PATH);
  return encodedRedirect("success", EXPENSE_TYPES_PATH, "Type added.");
};

export const deleteExpenseSubcategoryAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const subcategoryId = formData.get("subcategoryId")?.toString();
  if (!subcategoryId) {
    return encodedRedirect("error", EXPENSE_TYPES_PATH, "Invalid type.");
  }

  const subcategory = await prisma.expenseSubcategoryType.findUnique({
    where: { id: subcategoryId },
  });
  if (!subcategory) {
    return encodedRedirect("error", EXPENSE_TYPES_PATH, "Type not found.");
  }

  const inUse = await prisma.expense.count({
    where: { categoryId: subcategory.categoryId, subcategory: subcategory.label },
  });
  if (inUse > 0) {
    return encodedRedirect(
      "error",
      EXPENSE_TYPES_PATH,
      `Cannot delete: ${inUse} expense${inUse === 1 ? "" : "s"} still use this type.`,
    );
  }

  await prisma.expenseSubcategoryType.delete({ where: { id: subcategoryId } });

  revalidatePath(EXPENSE_TYPES_PATH);
  return encodedRedirect("success", EXPENSE_TYPES_PATH, "Type deleted.");
};
