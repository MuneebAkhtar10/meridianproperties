"use server";

import { revalidatePath } from "next/cache";

import { parseDate, parseNonNegativeMoney } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { deleteAttachment, uploadEntityDocument } from "@/lib/storage";
import { encodedRedirect } from "@/utils/utils";
import { UserType } from "@/lib/generated/prisma/client";

function contractsBack(propertyId: string): string {
  return `/protected/properties/${propertyId}/building-contracts`;
}

/** Spec: "agreement with building" — the property manager's own contract
 * with a vendor for shared building infrastructure (lift maintenance, fire
 * extinguisher servicing, generator, pest control, ...). See
 * BuildingServiceContract in schema.prisma. */
export const createBuildingServiceContractAction = async (
  formData: FormData,
) => {
  const admin = await requireRole(UserType.admin);

  const propertyId = formData.get("propertyId")?.toString();
  const contractType = formData.get("contractType")?.toString().trim();
  const supplierId = formData.get("supplierId")?.toString().trim() || null;
  const startDate = parseDate(formData.get("startDate")?.toString());
  const endDate = parseDate(formData.get("endDate")?.toString());
  const amount = parseNonNegativeMoney(formData.get("amount"));
  const notes = formData.get("notes")?.toString().trim() || null;
  const document = formData.get("document");

  if (!propertyId || !contractType || !startDate) {
    return encodedRedirect(
      "error",
      propertyId ? contractsBack(propertyId) : "/protected/properties",
      "Contract type and start date are required.",
    );
  }

  if (endDate && endDate < startDate) {
    return encodedRedirect(
      "error",
      contractsBack(propertyId),
      "End date cannot be before the start date.",
    );
  }

  const contract = await prisma.buildingServiceContract.create({
    data: {
      propertyId,
      contractType,
      supplierId,
      startDate,
      endDate,
      amount,
      notes,
      createdById: admin.id,
    },
  });

  let uploadError: string | null = null;
  if (document instanceof File && document.size > 0) {
    try {
      const uploaded = await uploadEntityDocument(
        document,
        "building-contract",
        contract.id,
      );
      await prisma.buildingServiceContract.update({
        where: { id: contract.id },
        data: {
          documentFileName: uploaded.fileName,
          documentFilePath: uploaded.objectKey,
          documentFileType: uploaded.fileType,
          documentFileSize: uploaded.fileSize,
        },
      });
    } catch (error) {
      console.error("Building contract document upload failed:", error);
      uploadError = error instanceof Error ? error.message : "Upload failed.";
    }
  }

  revalidatePath(contractsBack(propertyId));

  return encodedRedirect(
    uploadError ? "error" : "success",
    contractsBack(propertyId),
    uploadError
      ? `Contract saved, but the document wasn't: ${uploadError}`
      : "Contract added.",
  );
};

export const updateBuildingServiceContractAction = async (
  formData: FormData,
) => {
  await requireRole(UserType.admin);

  const contractId = formData.get("contractId")?.toString();
  const propertyId = formData.get("propertyId")?.toString();
  const contractType = formData.get("contractType")?.toString().trim();
  const supplierId = formData.get("supplierId")?.toString().trim() || null;
  const startDate = parseDate(formData.get("startDate")?.toString());
  const endDate = parseDate(formData.get("endDate")?.toString());
  const amount = parseNonNegativeMoney(formData.get("amount"));
  const notes = formData.get("notes")?.toString().trim() || null;
  const document = formData.get("document");

  if (!contractId || !propertyId || !contractType || !startDate) {
    return encodedRedirect(
      "error",
      propertyId ? contractsBack(propertyId) : "/protected/properties",
      "Contract type and start date are required.",
    );
  }

  if (endDate && endDate < startDate) {
    return encodedRedirect(
      "error",
      contractsBack(propertyId),
      "End date cannot be before the start date.",
    );
  }

  const existing = await prisma.buildingServiceContract.findUnique({
    where: { id: contractId },
    select: { documentFilePath: true },
  });

  let documentData: Partial<{
    documentFileName: string;
    documentFilePath: string;
    documentFileType: string;
    documentFileSize: number;
  }> = {};
  let uploadError: string | null = null;

  if (document instanceof File && document.size > 0) {
    try {
      const uploaded = await uploadEntityDocument(
        document,
        "building-contract",
        contractId,
      );
      documentData = {
        documentFileName: uploaded.fileName,
        documentFilePath: uploaded.objectKey,
        documentFileType: uploaded.fileType,
        documentFileSize: uploaded.fileSize,
      };
      if (existing?.documentFilePath) {
        try {
          await deleteAttachment(existing.documentFilePath);
        } catch (error) {
          console.error("Failed to delete old contract document:", error);
        }
      }
    } catch (error) {
      console.error("Building contract document upload failed:", error);
      uploadError = error instanceof Error ? error.message : "Upload failed.";
    }
  }

  await prisma.buildingServiceContract.update({
    where: { id: contractId },
    data: {
      contractType,
      supplierId,
      startDate,
      endDate,
      amount,
      notes,
      ...documentData,
    },
  });

  revalidatePath(contractsBack(propertyId));

  return encodedRedirect(
    uploadError ? "error" : "success",
    contractsBack(propertyId),
    uploadError
      ? `Contract updated, but the new document wasn't saved: ${uploadError}`
      : "Contract updated.",
  );
};

export const deleteBuildingServiceContractAction = async (
  formData: FormData,
) => {
  await requireRole(UserType.admin);

  const contractId = formData.get("contractId")?.toString();
  const propertyId = formData.get("propertyId")?.toString();
  if (!contractId || !propertyId) {
    return encodedRedirect("error", "/protected/properties", "Contract not found.");
  }

  const contract = await prisma.buildingServiceContract.findUnique({
    where: { id: contractId },
    select: { documentFilePath: true },
  });

  if (contract?.documentFilePath) {
    try {
      await deleteAttachment(contract.documentFilePath);
    } catch (error) {
      console.error("Failed to delete contract document from storage:", error);
    }
  }

  await prisma.buildingServiceContract.delete({ where: { id: contractId } });

  revalidatePath(contractsBack(propertyId));

  return encodedRedirect("success", contractsBack(propertyId), "Contract removed.");
};
