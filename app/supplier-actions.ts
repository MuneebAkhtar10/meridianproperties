"use server";

import { revalidatePath } from "next/cache";

import { parseDate, parseNonNegativeMoney } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { encodedRedirect } from "@/utils/utils";
import { UserType } from "@/lib/generated/prisma/client";

const SUPPLIERS_PATH = "/protected/admin/suppliers";

function readSupplierFields(formData: FormData) {
  const availableForAllProperties = formData.get("availableForAllProperties") === "on";
  return {
    companyName: formData.get("companyName")?.toString().trim() || "",
    companyNameAr: formData.get("companyNameAr")?.toString().trim() || null,
    externalReference:
      formData.get("externalReference")?.toString().trim() || null,
    active: formData.get("active") === "on",
    contactPerson: formData.get("contactPerson")?.toString().trim() || null,
    phone: formData.get("phone")?.toString().trim() || null,
    whatsapp: formData.get("whatsapp")?.toString().trim() || null,
    email: formData.get("email")?.toString().trim() || null,
    address: formData.get("address")?.toString().trim() || null,
    availableForEmergencies: formData.get("availableForEmergencies") === "on",
    calloutCharge: parseNonNegativeMoney(formData.get("calloutCharge")),
    contractStart: parseDate(formData.get("contractStart")?.toString()),
    contractEnd: parseDate(formData.get("contractEnd")?.toString()),
    contractInfo: formData.get("contractInfo")?.toString().trim() || null,
    notes: formData.get("notes")?.toString().trim() || null,
    categoryIds: formData.getAll("categoryIds").map(String).filter(Boolean),
    availableForAllProperties,
    // Specific links only matter (and are only stored) when NOT available
    // everywhere — keeps a re-toggled "all properties" supplier from
    // silently carrying over a stale property list.
    propertyIds: availableForAllProperties
      ? []
      : formData.getAll("propertyIds").map(String).filter(Boolean),
  };
}

export const createSupplierAction = async (formData: FormData) => {
  const admin = await requireRole(UserType.admin);

  const fields = readSupplierFields(formData);
  if (!fields.companyName) {
    return encodedRedirect("error", SUPPLIERS_PATH, "Enter a company name.");
  }

  await prisma.supplier.create({
    data: {
      companyName: fields.companyName,
      companyNameAr: fields.companyNameAr,
      externalReference: fields.externalReference,
      active: fields.active,
      contactPerson: fields.contactPerson,
      phone: fields.phone,
      whatsapp: fields.whatsapp,
      email: fields.email,
      address: fields.address,
      availableForEmergencies: fields.availableForEmergencies,
      calloutCharge: fields.calloutCharge,
      contractStart: fields.contractStart,
      contractEnd: fields.contractEnd,
      contractInfo: fields.contractInfo,
      notes: fields.notes,
      availableForAllProperties: fields.availableForAllProperties,
      createdById: admin.id,
      categories: {
        create: fields.categoryIds.map((categoryId) => ({ categoryId })),
      },
      properties: {
        create: fields.propertyIds.map((propertyId) => ({ propertyId })),
      },
    },
  });

  revalidatePath(SUPPLIERS_PATH);
  revalidatePath("/protected/expenses");
  return encodedRedirect("success", SUPPLIERS_PATH, "Supplier added.");
};

export const updateSupplierAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const supplierId = formData.get("supplierId")?.toString();
  if (!supplierId) {
    return encodedRedirect("error", SUPPLIERS_PATH, "Invalid supplier.");
  }

  const fields = readSupplierFields(formData);
  if (!fields.companyName) {
    return encodedRedirect("error", SUPPLIERS_PATH, "Enter a company name.");
  }

  const existing = await prisma.supplier.findUnique({
    where: { id: supplierId },
  });
  if (!existing) {
    return encodedRedirect("error", SUPPLIERS_PATH, "Supplier not found.");
  }

  // Explicit join tables have no Prisma "set" shorthand — reconcile both
  // by clearing and recreating them in the same transaction as the update.
  await prisma.$transaction([
    prisma.supplier.update({
      where: { id: supplierId },
      data: {
        companyName: fields.companyName,
        companyNameAr: fields.companyNameAr,
        externalReference: fields.externalReference,
        active: fields.active,
        contactPerson: fields.contactPerson,
        phone: fields.phone,
        whatsapp: fields.whatsapp,
        email: fields.email,
        address: fields.address,
        availableForEmergencies: fields.availableForEmergencies,
        calloutCharge: fields.calloutCharge,
        contractStart: fields.contractStart,
        contractEnd: fields.contractEnd,
        contractInfo: fields.contractInfo,
        notes: fields.notes,
        availableForAllProperties: fields.availableForAllProperties,
      },
    }),
    prisma.supplierCategory.deleteMany({ where: { supplierId } }),
    prisma.supplierCategory.createMany({
      data: fields.categoryIds.map((categoryId) => ({
        supplierId,
        categoryId,
      })),
    }),
    prisma.supplierProperty.deleteMany({ where: { supplierId } }),
    prisma.supplierProperty.createMany({
      data: fields.propertyIds.map((propertyId) => ({
        supplierId,
        propertyId,
      })),
    }),
  ]);

  revalidatePath(SUPPLIERS_PATH);
  revalidatePath("/protected/expenses");
  return encodedRedirect("success", SUPPLIERS_PATH, "Supplier updated.");
};

export const deleteSupplierAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const supplierId = formData.get("supplierId")?.toString();
  if (!supplierId) {
    return encodedRedirect("error", SUPPLIERS_PATH, "Invalid supplier.");
  }

  const inUse = await prisma.expense.count({ where: { supplierId } });
  if (inUse > 0) {
    return encodedRedirect(
      "error",
      SUPPLIERS_PATH,
      `Cannot delete: ${inUse} expense${inUse === 1 ? "" : "s"} still use this supplier.`,
    );
  }

  await prisma.supplier.delete({ where: { id: supplierId } });

  revalidatePath(SUPPLIERS_PATH);
  revalidatePath("/protected/expenses");
  return encodedRedirect("success", SUPPLIERS_PATH, "Supplier deleted.");
};
