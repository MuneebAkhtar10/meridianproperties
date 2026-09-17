"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { parseDate, parseNonNegativeMoney, parsePositiveMoney } from "@/lib/finance";
import { isOwnerChargeMethod } from "@/lib/owner-charge-method";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { deleteAttachment, uploadExpenseReceipt } from "@/lib/storage";
import { encodedRedirect } from "@/utils/utils";
import { PaymentCollector, UserType } from "@/lib/generated/prisma/client";

const EXPENSES_PATH = "/protected/expenses";

/** A category must exist and the subcategory (if any) must be one of its
 * own types — validated live against the admin-managed list rather than a
 * fixed enum, since either can grow at any time from the Suppliers page. */
async function validCategoryAndSubcategory(
  categoryId: string | undefined,
  subcategory: string | undefined,
): Promise<boolean> {
  if (!categoryId || !subcategory) return false;
  const category = await prisma.expenseCategoryType.findUnique({
    where: { id: categoryId },
    include: { subcategories: { select: { label: true } } },
  });
  if (!category) return false;
  return category.subcategories.some((s) => s.label === subcategory);
}

/** Empty string (the "Company default" option) means no external
 * supplier — otherwise the supplier must exist and actually cover this
 * category, same live-DB-check idiom as validCategoryAndSubcategory. */
async function validSupplier(
  supplierId: string | undefined,
  categoryId: string,
): Promise<boolean> {
  if (!supplierId) return true;
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: { categories: { select: { categoryId: true } } },
  });
  if (!supplier) return false;
  return supplier.categories.some((c) => c.categoryId === categoryId);
}

export const createExpenseAction = async (formData: FormData) => {
  const admin = await requireRole(UserType.admin);

  const propertyId = formData.get("propertyId")?.toString();
  const mode = formData.get("mode")?.toString();
  const unitIds = formData
    .getAll("unitIds")
    .map((value) => value.toString())
    .filter(Boolean);
  const categoryId = formData.get("categoryId")?.toString();
  const subcategory = formData.get("subcategory")?.toString();
  const supplierId = formData.get("supplierId")?.toString() || undefined;
  const description = formData.get("description")?.toString().trim();
  const amount = parsePositiveMoney(formData.get("amount"));
  const vatRaw = formData.get("vatAmount")?.toString().trim();
  const vatAmount = vatRaw ? parseNonNegativeMoney(formData.get("vatAmount")) : "0";
  const fundId = formData.get("fundId")?.toString();
  const paymentReference =
    formData.get("paymentReference")?.toString().trim() || null;
  const paidByRaw = formData.get("paidBy")?.toString();
  const paidBy = (
    Object.values(PaymentCollector) as string[]
  ).includes(paidByRaw ?? "")
    ? (paidByRaw as PaymentCollector)
    : PaymentCollector.management;
  const ownerChargeMethodRaw = formData.get("ownerChargeMethod")?.toString() ?? "";
  const ownerChargeMethod = isOwnerChargeMethod(ownerChargeMethodRaw)
    ? ownerChargeMethodRaw
    : "extra_charge";
  const notes = formData.get("notes")?.toString().trim() || null;
  const date = parseDate(formData.get("date")?.toString());
  const receipt = formData.get("receipt");

  if (
    !propertyId ||
    (mode !== "common" && mode !== "units") ||
    (mode === "units" && unitIds.length === 0) ||
    !(await validCategoryAndSubcategory(categoryId, subcategory)) ||
    !(await validSupplier(supplierId, categoryId!)) ||
    !description ||
    !amount ||
    vatAmount === null ||
    !fundId ||
    !date
  ) {
    return encodedRedirect(
      "error",
      EXPENSES_PATH,
      "Complete the expense details correctly.",
    );
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true },
  });
  if (!property) {
    return encodedRedirect("error", EXPENSES_PATH, "Property not found.");
  }

  // Common area logs one property-wide row. Specific units log ONE row too
  // — shared across all the selected units via ExpenseUnit — so an OMR 180
  // bill covering 3 blocks stays a single 180 entry, not 3 duplicated ones.
  let targetPropertyId: string | null = null;
  let targetUnitIds: string[] = [];

  if (mode === "common") {
    targetPropertyId = propertyId;
  } else {
    const units = await prisma.unit.findMany({
      where: { id: { in: unitIds }, propertyId },
      select: { id: true },
    });
    if (units.length !== unitIds.length) {
      return encodedRedirect(
        "error",
        EXPENSES_PATH,
        "One or more selected units don't belong to that property.",
      );
    }
    targetUnitIds = units.map((unit) => unit.id);
  }

  const created = await prisma.expense.create({
    data: {
      propertyId: targetPropertyId,
      categoryId: categoryId!,
      subcategory,
      supplierId: supplierId ?? null,
      description,
      amount,
      vatAmount: vatAmount!,
      fundId: fundId!,
      paymentReference,
      paidBy,
      ownerChargeMethod,
      notes,
      date,
      createdById: admin.id,
      units: {
        create: targetUnitIds.map((unitId) => ({ unitId })),
      },
    },
  });

  let uploadError: string | null = null;
  if (receipt instanceof File && receipt.size > 0) {
    try {
      const uploaded = await uploadExpenseReceipt(receipt, created.id);
      await prisma.expense.update({
        where: { id: created.id },
        data: {
          receiptFileName: uploaded.fileName,
          receiptFilePath: uploaded.objectKey,
          receiptFileType: uploaded.fileType,
          receiptFileSize: uploaded.fileSize,
        },
      });
    } catch (error) {
      unstable_rethrow(error);
      console.error("Expense receipt upload failed:", error);
      uploadError =
        error instanceof Error ? error.message : "The file was not accepted.";
    }
  }

  revalidatePath(EXPENSES_PATH);

  return encodedRedirect(
    uploadError ? "error" : "success",
    EXPENSES_PATH,
    uploadError
      ? `Expense saved, but the receipt wasn't: ${uploadError}`
      : "Expense logged.",
  );
};

export const updateExpenseAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const expenseId = formData.get("expenseId")?.toString();
  const categoryId = formData.get("categoryId")?.toString();
  const subcategory = formData.get("subcategory")?.toString();
  const supplierId = formData.get("supplierId")?.toString() || undefined;
  const description = formData.get("description")?.toString().trim();
  const amount = parsePositiveMoney(formData.get("amount"));
  const vatRaw = formData.get("vatAmount")?.toString().trim();
  const vatAmount = vatRaw ? parseNonNegativeMoney(formData.get("vatAmount")) : "0";
  const fundId = formData.get("fundId")?.toString();
  const paymentReference =
    formData.get("paymentReference")?.toString().trim() || null;
  const paidByRaw = formData.get("paidBy")?.toString();
  const paidBy = (
    Object.values(PaymentCollector) as string[]
  ).includes(paidByRaw ?? "")
    ? (paidByRaw as PaymentCollector)
    : PaymentCollector.management;
  const ownerChargeMethodRaw = formData.get("ownerChargeMethod")?.toString() ?? "";
  const ownerChargeMethod = isOwnerChargeMethod(ownerChargeMethodRaw)
    ? ownerChargeMethodRaw
    : "extra_charge";
  const notes = formData.get("notes")?.toString().trim() || null;
  const date = parseDate(formData.get("date")?.toString());
  const receipt = formData.get("receipt");

  if (
    !expenseId ||
    !(await validCategoryAndSubcategory(categoryId, subcategory)) ||
    !(await validSupplier(supplierId, categoryId!)) ||
    !description ||
    !amount ||
    vatAmount === null ||
    !fundId ||
    !date
  ) {
    return encodedRedirect(
      "error",
      EXPENSES_PATH,
      "Complete the expense details correctly.",
    );
  }

  const existing = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: { receiptFilePath: true },
  });
  if (!existing) {
    return encodedRedirect("error", EXPENSES_PATH, "Expense not found.");
  }

  let uploadError: string | null = null;
  let receiptData: Partial<{
    receiptFileName: string;
    receiptFilePath: string;
    receiptFileType: string;
    receiptFileSize: number;
  }> = {};

  if (receipt instanceof File && receipt.size > 0) {
    try {
      const uploaded = await uploadExpenseReceipt(receipt, expenseId);
      receiptData = {
        receiptFileName: uploaded.fileName,
        receiptFilePath: uploaded.objectKey,
        receiptFileType: uploaded.fileType,
        receiptFileSize: uploaded.fileSize,
      };
      // Old file is orphaned in storage once the row no longer points to it;
      // clean it up now that the replacement has uploaded successfully.
      if (existing.receiptFilePath) {
        try {
          await deleteAttachment(existing.receiptFilePath);
        } catch (error) {
          console.error("Failed to delete old expense receipt:", error);
        }
      }
    } catch (error) {
      unstable_rethrow(error);
      console.error("Expense receipt upload failed:", error);
      uploadError =
        error instanceof Error ? error.message : "The file was not accepted.";
    }
  }

  await prisma.expense.update({
    where: { id: expenseId },
    data: {
      categoryId: categoryId!,
      subcategory,
      supplierId: supplierId ?? null,
      description,
      amount,
      vatAmount: vatAmount!,
      fundId: fundId!,
      paymentReference,
      paidBy,
      ownerChargeMethod,
      notes,
      date,
      ...receiptData,
    },
  });

  revalidatePath(EXPENSES_PATH);

  return encodedRedirect(
    uploadError ? "error" : "success",
    EXPENSES_PATH,
    uploadError
      ? `Expense updated, but the new receipt wasn't saved: ${uploadError}`
      : "Expense updated.",
  );
};

export const deleteExpenseAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const expenseId = formData.get("expenseId")?.toString();
  if (!expenseId) {
    return encodedRedirect("error", EXPENSES_PATH, "Expense not found.");
  }

  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: { receiptFilePath: true },
  });

  if (!expense) {
    return encodedRedirect("error", EXPENSES_PATH, "Expense not found.");
  }

  if (expense.receiptFilePath) {
    try {
      await deleteAttachment(expense.receiptFilePath);
    } catch (error) {
      console.error("Failed to delete expense receipt from storage:", error);
    }
  }

  await prisma.expense.delete({ where: { id: expenseId } });
  revalidatePath(EXPENSES_PATH);

  return encodedRedirect("success", EXPENSES_PATH, "Expense deleted.");
};
