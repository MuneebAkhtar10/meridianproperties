import "server-only";

import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  ALLOWED_DOCUMENT_TYPES,
  ALLOWED_IMAGE_TYPES,
  fileMimeType,
  fileRejectionReason,
} from "@/lib/upload-limits";

/**
 * Supabase Storage.
 *
 * The bucket is private and nothing is served straight out of it: every
 * download goes through `/api/attachment/[id]`, which checks the caller owns
 * the request, is an admin, or is the worker assigned to it.
 */

/** Size and type rules are shared with the browser; see `lib/upload-limits.ts`. */
export {
  ALLOWED_DOCUMENT_TYPES,
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/upload-limits";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.`);
  }
  return value;
}

export function getBucket(): string {
  return requireEnv("SUPABASE_STORAGE_BUCKET");
}

/** Creates the bucket if it is not there yet. Safe to call repeatedly. */
export async function ensureBucket(): Promise<void> {
  const storage = createAdminClient().storage;
  const bucket = getBucket();

  const { data: existing } = await storage.getBucket(bucket);
  if (existing) {
    return;
  }

  const { error } = await storage.createBucket(bucket, { public: false });
  // Another request may have created it first; that's fine.
  if (error && !/already exists/i.test(error.message)) {
    throw error;
  }
}

/** Object key for an attachment, namespaced per maintenance request. */
function buildObjectKey(requestId: string, fileName: string): string {
  const extension = fileName.includes(".")
    ? fileName.split(".").pop()!.toLowerCase()
    : "bin";
  return `attachments/${requestId}/${randomUUID()}.${extension}`;
}

function buildFinancialObjectKey(ownerId: string, fileName: string): string {
  const extension = fileName.includes(".")
    ? fileName.split(".").pop()!.toLowerCase()
    : "bin";
  return `financial-documents/${ownerId}/${randomUUID()}.${extension}`;
}

function buildEntityDocumentObjectKey(
  targetType: string,
  targetId: string,
  fileName: string,
): string {
  const extension = fileName.includes(".")
    ? fileName.split(".").pop()!.toLowerCase()
    : "bin";
  return `entity-documents/${targetType}/${targetId}/${randomUUID()}.${extension}`;
}

export type UploadedObject = {
  objectKey: string;
  fileName: string;
  fileType: string;
  fileSize: number;
};

/** Uploads a maintenance photo. Images only. */
export async function uploadAttachment(
  file: File,
  requestId: string,
): Promise<UploadedObject> {
  return store(file, ALLOWED_IMAGE_TYPES, buildObjectKey(requestId, file.name));
}

/** Uploads a private bill or payment receipt. PDF is accepted in addition to images. */
export async function uploadFinancialDocument(
  file: File,
  ownerId: string,
): Promise<UploadedObject> {
  return store(
    file,
    ALLOWED_DOCUMENT_TYPES,
    buildFinancialObjectKey(ownerId, file.name),
  );
}

/** Uploads a private property, tenancy or personal document. */
export async function uploadEntityDocument(
  file: File,
  targetType: string,
  targetId: string,
): Promise<UploadedObject> {
  return store(
    file,
    ALLOWED_DOCUMENT_TYPES,
    buildEntityDocumentObjectKey(targetType, targetId, file.name),
  );
}

/**
 * Streams one uploaded file into the bucket under `objectKey`.
 *
 * The size and type rules are the same ones the browser applies before posting,
 * so reaching here with a bad file means the form was bypassed. Throws with the
 * reason; callers turn that into a message on the form.
 */
async function store(
  file: File,
  allowedTypes: readonly string[],
  objectKey: string,
): Promise<UploadedObject> {
  const rejection = fileRejectionReason(file, allowedTypes);
  if (rejection) {
    throw new Error(rejection);
  }

  await ensureBucket();

  const fileType = fileMimeType(file);
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await createAdminClient()
    .storage.from(getBucket())
    .upload(objectKey, buffer, { contentType: fileType, upsert: false });

  if (error) {
    throw error;
  }

  return {
    objectKey,
    fileName: file.name,
    fileType,
    fileSize: file.size,
  };
}

/** Reads an object back out of the bucket as a Buffer. */
export async function downloadAttachment(objectKey: string): Promise<Buffer> {
  const { data, error } = await createAdminClient()
    .storage.from(getBucket())
    .download(objectKey);

  if (error || !data) {
    throw error ?? new Error("File not found in storage");
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function deleteAttachment(objectKey: string): Promise<void> {
  const { error } = await createAdminClient()
    .storage.from(getBucket())
    .remove([objectKey]);

  if (error) {
    throw error;
  }
}
