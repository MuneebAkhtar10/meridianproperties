import "server-only";

import {
  deleteAttachment,
  uploadEntityDocument,
  type UploadedObject,
} from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import type {
  EntityDocumentCategory,
  Prisma,
} from "@/lib/generated/prisma/client";
import type { EntityDocumentTargetType } from "@/lib/entity-documents";

export type EntityDocumentTarget =
  | { type: "property"; id: string }
  | { type: "tenancy"; id: string }
  | { type: "user"; id: string };

export type EntityDocumentUploadGroup = {
  category: EntityDocumentCategory;
  files: File[];
  label?: string | null;
};

export function uploadedFiles(formData: FormData, fieldName: string): File[] {
  return formData
    .getAll(fieldName)
    .filter((value): value is File => value instanceof File && value.size > 0);
}

function targetData(
  target: EntityDocumentTarget,
): Pick<
  Prisma.EntityDocumentCreateManyInput,
  "propertyId" | "tenancyId" | "userId"
> {
  return {
    propertyId: target.type === "property" ? target.id : null,
    tenancyId: target.type === "tenancy" ? target.id : null,
    userId: target.type === "user" ? target.id : null,
  };
}

export async function storeEntityDocumentGroups({
  target,
  uploadedById,
  groups,
}: {
  target: EntityDocumentTarget;
  uploadedById: string;
  groups: EntityDocumentUploadGroup[];
}): Promise<number> {
  const candidates = groups.flatMap((group) =>
    group.files.map((file) => ({ ...group, file })),
  );

  if (candidates.length === 0) return 0;
  if (candidates.length > 12) {
    throw new Error("Upload up to 12 documents at a time.");
  }

  const uploaded: Array<{
    category: EntityDocumentCategory;
    label?: string | null;
    file: UploadedObject;
  }> = [];

  try {
    for (const candidate of candidates) {
      const file = await uploadEntityDocument(
        candidate.file,
        target.type,
        target.id,
      );
      uploaded.push({
        category: candidate.category,
        label: candidate.label,
        file,
      });
    }

    await prisma.entityDocument.createMany({
      data: uploaded.map(({ category, label, file }) => ({
        ...targetData(target),
        category,
        label: label?.trim() || null,
        fileName: file.fileName,
        filePath: file.objectKey,
        fileType: file.fileType,
        fileSize: file.fileSize,
        uploadedById,
      })),
    });

    return uploaded.length;
  } catch (error) {
    await Promise.allSettled(
      uploaded.map(({ file }) => deleteAttachment(file.objectKey)),
    );
    throw error;
  }
}

export function parseDocumentTarget(
  targetType: string | undefined,
  targetId: string | undefined,
): EntityDocumentTarget | null {
  if (
    !targetId ||
    !targetType ||
    !(["property", "tenancy", "user"] as EntityDocumentTargetType[]).includes(
      targetType as EntityDocumentTargetType,
    )
  ) {
    return null;
  }

  return { type: targetType, id: targetId } as EntityDocumentTarget;
}
