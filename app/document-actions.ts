"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import {
  parseDocumentTarget,
  storeEntityDocumentGroups,
  uploadedFiles,
  type EntityDocumentTarget,
} from "@/lib/entity-document-service";
import { parseDate } from "@/lib/finance";
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

  if (target.type === "unit") {
    const unit = await prisma.unit.findUnique({
      where: { id: target.id },
      select: { ownerId: true },
    });
    return Boolean(
      unit &&
        (user.userType === UserType.admin || unit.ownerId === user.id),
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

async function revalidateDocumentTarget(
  target: EntityDocumentTarget,
  back: string,
) {
  revalidatePath(back);
  if (target.type === "property") {
    revalidatePath(`/protected/properties/${target.id}`);
  } else if (target.type === "unit") {
    const unit = await prisma.unit.findUnique({
      where: { id: target.id },
      select: { propertyId: true },
    });
    if (unit) {
      revalidatePath(`/protected/properties/${unit.propertyId}`);
    }
  } else if (target.type === "tenancy") {
    revalidatePath("/protected/tenancies");
    revalidatePath("/protected/documents");
  } else {
    revalidatePath("/protected/users");
    revalidatePath("/protected/documents");
  }
}

export type UploadDocumentsState = {
  ok: boolean;
  message: string;
} | null;

/** Shared upload logic for both the redirect-based action (every
 * standalone documents page) and the inline one (used inside a modal,
 * where navigating away would close it) — same validation, same storage
 * call, same revalidation, just a different way of reporting the result. */
async function performDocumentUpload(
  formData: FormData,
): Promise<{ back: string; ok: boolean; message: string }> {
  const user = await requireUser();
  const back = safeBack(formData.get("back"));
  const target = parseDocumentTarget(
    formData.get("targetType")?.toString(),
    formData.get("targetId")?.toString(),
  );
  const category = formData.get("category")?.toString();
  const label = formData.get("label")?.toString().trim() || null;
  const expiresAt = parseDate(formData.get("expiresAt")?.toString());
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
    return {
      back,
      ok: false,
      message: "Select a valid document category and at least one PDF or image.",
    };
  }

  // A tenancy document (agreement, municipality registration, ...) and an
  // ownership contract both always have a real-world term, so unlike other
  // document types their expiry isn't optional — must agree with
  // EntityDocumentManager's matching client-side `expiryRequired`.
  const expiryRequired =
    target.type === "tenancy" ||
    category === EntityDocumentCategory.ownership_contract;
  if (expiryRequired && !expiresAt) {
    return {
      back,
      ok: false,
      message: "Enter an expiry date for this document.",
    };
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
          expiresAt,
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
    await revalidateDocumentTarget(target, back);
  }

  return {
    back,
    ok: !uploadError,
    message:
      uploadError ?? `${count} document${count === 1 ? "" : "s"} uploaded.`,
  };
}

export const uploadEntityDocumentsAction = async (formData: FormData) => {
  const { back, ok, message } = await performDocumentUpload(formData);
  return encodedRedirect(ok ? "success" : "error", back, message);
};

/** Same upload, but for a form embedded inside a modal (e.g. the unit
 * Manage modal's Agreements tab) — returns the result instead of
 * redirecting, so the modal stays open and shows the outcome inline via
 * useActionState rather than navigating away to show a page-level banner
 * the modal itself would cover up anyway. */
export const uploadEntityDocumentsInlineAction = async (
  _prevState: UploadDocumentsState,
  formData: FormData,
): Promise<UploadDocumentsState> => {
  const { ok, message } = await performDocumentUpload(formData);
  return { ok, message };
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
      unitId: true,
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
    : document.unitId
      ? { type: "unit", id: document.unitId }
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

  await revalidateDocumentTarget(target, back);
  return encodedRedirect("success", back, "Document removed.");
};
