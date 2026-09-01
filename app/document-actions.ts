"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import {
  parseDocumentTarget,
  storeEntityDocumentGroups,
  uploadedFiles,
  type EntityDocumentTarget,
} from "@/lib/entity-document-service";
import {
  categoriesForTarget,
  type EntityDocumentTargetType,
} from "@/lib/entity-documents";
import { prisma } from "@/lib/prisma";
import { deleteAttachment } from "@/lib/storage";
import { requireUser } from "@/lib/session";
import { encodedRedirect } from "@/utils/utils";
import {
  EntityDocumentCategory,
  UserType,
} from "@/lib/generated/prisma/client";

function safeBack(value: FormDataEntryValue | null): string {
  const back = value?.toString();
  return back?.startsWith("/protected") ? back : "/protected";
}

async function canManageTarget(
  user: { id: string; userType: UserType },
  target: EntityDocumentTarget,
): Promise<boolean> {
  if (target.type === "property") {
    return (
      user.userType === UserType.admin &&
      Boolean(
        await prisma.property.findUnique({
          where: { id: target.id },
          select: { id: true },
        }),
      )
    );
  }

  if (target.type === "tenancy") {
    const tenancy = await prisma.tenancy.findUnique({
      where: { id: target.id },
      select: { tenantId: true },
    });
    return Boolean(
      tenancy &&
        (user.userType === UserType.admin || tenancy.tenantId === user.id),
    );
  }

  return (
    (user.userType === UserType.admin || target.id === user.id) &&
    Boolean(
      await prisma.user.findUnique({
        where: { id: target.id },
        select: { id: true },
      }),
    )
  );
}

function revalidateDocumentTarget(target: EntityDocumentTarget, back: string) {
  revalidatePath(back);
  if (target.type === "property") {
    revalidatePath(`/protected/properties/${target.id}`);
  } else if (target.type === "tenancy") {
    revalidatePath("/protected/tenancies");
    revalidatePath("/protected/documents");
  } else {
    revalidatePath("/protected/users");
    revalidatePath("/protected/documents");
  }
}

export const uploadEntityDocumentsAction = async (formData: FormData) => {
  const user = await requireUser();
  const back = safeBack(formData.get("back"));
  const target = parseDocumentTarget(
    formData.get("targetType")?.toString(),
    formData.get("targetId")?.toString(),
  );
  const category = formData.get("category")?.toString();
  const label = formData.get("label")?.toString().trim() || null;
  const documents = uploadedFiles(formData, "documents");

  if (
    !target ||
    !category ||
    !Object.values(EntityDocumentCategory).includes(
      category as EntityDocumentCategory,
    ) ||
    !categoriesForTarget(target.type).includes(
      category as EntityDocumentCategory,
    ) ||
    documents.length === 0 ||
    !(await canManageTarget(user, target))
  ) {
    return encodedRedirect(
      "error",
      back,
      "Select a valid document category and at least one PDF or image.",
    );
  }

  // The redirect stays outside the try on purpose. `redirect()` reports itself by
  // throwing, so a redirect called inside this try would be caught by its own
  // catch and reported to the user as the error "NEXT_REDIRECT" — on an upload
  // that had in fact just succeeded.
  let count = 0;
  let uploadError: string | null = null;

  try {
    count = await storeEntityDocumentGroups({
      target,
      uploadedById: user.id,
      groups: [
        {
          category: category as EntityDocumentCategory,
          label,
          files: documents,
        },
      ],
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error("Document upload failed:", error);
    uploadError =
      error instanceof Error ? error.message : "Document upload failed.";
  }

  if (count > 0) {
    revalidateDocumentTarget(target, back);
  }

  return encodedRedirect(
    uploadError ? "error" : "success",
    back,
    uploadError ?? `${count} document${count === 1 ? "" : "s"} uploaded.`,
  );
};

export const deleteEntityDocumentAction = async (formData: FormData) => {
  const user = await requireUser();
  const back = safeBack(formData.get("back"));
  const documentId = formData.get("documentId")?.toString();

  if (!documentId) {
    return encodedRedirect("error", back, "Document not found.");
  }

  const document = await prisma.entityDocument.findUnique({
    where: { id: documentId },
    select: {
      filePath: true,
      propertyId: true,
      tenancyId: true,
      userId: true,
      uploadedById: true,
    },
  });

  if (!document) {
    return encodedRedirect("error", back, "Document not found.");
  }

  const target: EntityDocumentTarget = document.propertyId
    ? { type: "property", id: document.propertyId }
    : document.tenancyId
      ? { type: "tenancy", id: document.tenancyId }
      : { type: "user", id: document.userId! };

  if (!(await canManageTarget(user, target))) {
    return encodedRedirect("error", back, "You cannot delete this document.");
  }

  if (
    user.userType !== UserType.admin &&
    target.type === "tenancy" &&
    document.uploadedById !== user.id
  ) {
    return encodedRedirect(
      "error",
      back,
      "Only an administrator can remove this tenancy document.",
    );
  }

  await prisma.entityDocument.delete({ where: { id: documentId } });

  try {
    await deleteAttachment(document.filePath);
  } catch (error) {
    console.error("Could not remove document object:", error);
  }

  revalidateDocumentTarget(target, back);
  return encodedRedirect("success", back, "Document removed.");
};
