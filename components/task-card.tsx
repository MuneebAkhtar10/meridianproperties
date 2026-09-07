"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Home,
  Image as ImageIcon,
  KeyRound,
  LoaderCircle,
  MapPin,
  PauseCircle,
  Receipt,
  ShieldCheck,
  Upload,
  User,
  X,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/finance";
import { PriorityBadge, StatusBadge } from "@/lib/status";
import {
  ALLOWED_IMAGE_TYPES,
  IMAGE_ACCEPT,
  MAX_UPLOAD_LABEL,
  batchRejectionReason,
} from "@/lib/upload-limits";
import { attachmentUrl } from "@/lib/utils";
import { formatUnitLabel } from "@/lib/property-types";
import type { Attachment, RequestWithPlace } from "@/types/maintenance";

type Action = "enRoute" | "startWork" | "hold" | "complete";

type StatusResult = { ok: boolean; message: string };

interface TaskCardProps {
  task: RequestWithPlace;
  attachments?: Attachment[];
  onStartWork: (taskId: string) => Promise<StatusResult>;
  onCompleteTask: (taskId: string, formData: FormData) => Promise<StatusResult>;
  onEnRoute: (taskId: string, notes?: string) => Promise<StatusResult>;
  onHold: (
    taskId: string,
    reason: string,
    supplyItem?: string,
    supplyNotes?: string,
  ) => Promise<StatusResult>;
  /** Mints a 4-digit code on the tenant's screen; worker then enters it. */
  onRequestCompletion: (taskId: string) => Promise<StatusResult>;
  /** Verifies the tenant's code and completes the task. */
  onSubmitCompletionCode: (formData: FormData) => Promise<StatusResult>;
  /** Clears the requested code without completing. */
  onCancelCompletion: (taskId: string) => Promise<StatusResult>;
}

export default function TaskCard({
  task,
  attachments = [],
  onStartWork,
  onEnRoute,
  onHold,
  onRequestCompletion,
  onSubmitCompletionCode,
  onCancelCompletion,
}: TaskCardProps) {
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [notes, setNotes] = useState("");
  const [supplyItem, setSupplyItem] = useState("");
  const [supplyNotes, setSupplyNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [code, setCode] = useState("");
  const [showAttachments, setShowAttachments] = useState(false);
  const [feedback, setFeedback] = useState<StatusResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // The server sets this once the worker requests completion. While it's set the
  // card stays in code-entry mode regardless of local pendingAction state.
  const awaitingCode = Boolean(task.completionCode);

  const reset = () => {
    setPendingAction(null);
    setNotes("");
    setSupplyItem("");
    setSupplyNotes("");
    setFiles([]);
    setCode("");
  };

  const finish = (result: StatusResult) => {
    // Cancel the previous message's dismiss timer. Without this, the timer from
    // an earlier step fires a few seconds later and blanks the message that has
    // since replaced it — which is exactly how a "wrong code" error vanished
    // before the worker could read it.
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
    }

    setFeedback(result);
    dismissTimer.current = setTimeout(() => setFeedback(null), 6000);

    // Only refresh on success: a failed attempt changed nothing server-side.
    if (result.ok) {
      router.refresh();
    }
  };

  const confirm = async () => {
    setIsSaving(true);
    let result: StatusResult;

    try {
      if (awaitingCode) {
        const formData = new FormData();
        formData.append("taskId", task.id);
        formData.append("code", code);
        formData.append("notes", notes);
        for (const file of files) {
          formData.append("attachments", file);
        }
        result = await onSubmitCompletionCode(formData);
      } else if (pendingAction === "enRoute") {
        result = await onEnRoute(task.id, notes);
      } else if (pendingAction === "startWork") {
        result = await onStartWork(task.id);
      } else if (pendingAction === "hold") {
        result = await onHold(
          task.id,
          notes,
          supplyItem.trim() || undefined,
          supplyNotes.trim() || undefined,
        );
      } else {
        // pendingAction === "complete" — ask the tenant for a code first.
        result = await onRequestCompletion(task.id);
      }
    } catch {
      result = {
        ok: false,
        message: "Something went wrong. Please try again.",
      };
    }

    finish(result);
    setIsSaving(false);

    // Keep notes/files around for the code step; only clear for non-complete flows.
    if (!awaitingCode && pendingAction !== "complete") {
      reset();
    } else if (awaitingCode && result.ok) {
      // Completed — drop local state.
      reset();
    }
  };

  /**
   * Photos ride along in the same request as the completion, and a body over the
   * Server Action limit is dropped before the action runs — the worker would see
   * a generic failure on a job they finished. So the batch is weighed here.
   */
  const addPhotos = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = [...files, ...Array.from(event.target.files ?? [])];
    const rejection = batchRejectionReason(next, ALLOWED_IMAGE_TYPES);

    event.target.value = "";

    if (rejection) {
      finish({ ok: false, message: rejection });
      return;
    }

    setFiles(next);
  };

  const cancelCompletion = async () => {
    setIsSaving(true);
    const result = await onCancelCompletion(task.id).catch(() => ({
      ok: false,
      message: "Could not cancel. Please try again.",
    }));
    finish(result);
    setIsSaving(false);
    reset();
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h3 className="font-semibold">{task.title}</h3>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Home className="h-3.5 w-3.5" />
                {task.unit
                  ? `${task.unit.property.name} · ${formatUnitLabel(
                      task.unit.property.propertyType,
                      task.unit.label,
                    )}`
                  : task.property
                    ? `${task.property.name} · Common area`
                    : "No unit linked"}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {task.location}
              </span>
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                {task.user.email}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
          </div>
        </div>

        <p className="rounded-lg bg-muted/50 p-3 text-sm">{task.description}</p>

        {attachments.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowAttachments(!showAttachments)}
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <ImageIcon className="h-4 w-4" />
              {attachments.length} photo
              {attachments.length === 1 ? "" : "s"} from the tenant
            </button>

            {showAttachments && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachmentUrl(attachment.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square overflow-hidden rounded-lg border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={attachmentUrl(attachment.id)}
                      alt={attachment.fileName}
                      className="h-full w-full object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {(task.supplyRequests?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Supply requests
            </p>
            {task.supplyRequests!.map((request) => (
              <div
                key={request.id}
                className="space-y-1 rounded-lg border p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{request.item}</span>
                  {request.status === "pending" && (
                    <span className="inline-flex items-center rounded-full bg-[#0886be]/10 px-2 py-0.5 text-xs font-medium text-[#0886be] ring-1 ring-inset ring-[#0886be]/20">
                      Waiting for admin
                    </span>
                  )}
                  {request.status === "approved" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                      <CheckCircle2 className="h-3 w-3" />
                      Approved
                    </span>
                  )}
                  {request.status === "denied" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
                      <XCircle className="h-3 w-3" />
                      Denied
                    </span>
                  )}
                </div>
                {request.notes && (
                  <p className="text-xs text-muted-foreground">
                    {request.notes}
                  </p>
                )}
                {request.adminNote && (
                  <p className="text-xs text-muted-foreground">
                    Admin: {request.adminNote}
                  </p>
                )}
                {request.status === "approved" && request.cost != null && (
                  <p className="text-xs font-medium text-emerald-700">
                    Cost: {formatMoney(request.cost)}
                  </p>
                )}
                {request.receiptPath && (
                  <a
                    href={`/api/supply-receipt/${request.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary underline"
                  >
                    <Receipt className="h-3 w-3" />
                    View uploaded receipt
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Code-entry mode: the tenant has a code, the worker types it back. */}
        {awaitingCode ? (
          <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-2">
              <KeyRound className="mt-0.5 h-4 w-4 text-primary" />
              <p className="text-sm">
                Ask the tenant for their 4-digit code, then enter it to confirm
                the work is done.
              </p>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor={`code-${task.id}`} className="text-xs">
                  Tenant&apos;s code
                </Label>
                <Input
                  id={`code-${task.id}`}
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  inputMode="numeric"
                  placeholder="0000"
                  className="text-lg tracking-[0.5em]"
                  maxLength={4}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Notes and photos selected earlier will be saved with the
              completion.
            </p>
          </div>
        ) : (
          /* Pre-completion step: notes, and (for completion) proof photos. */
          pendingAction && (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              <div className="space-y-1.5">
                <Label htmlFor={`notes-${task.id}`}>
                  {pendingAction === "hold"
                    ? "Why is this job on hold?"
                    : "Notes (optional)"}
                </Label>
                <Textarea
                  id={`notes-${task.id}`}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder={
                    pendingAction === "hold"
                      ? "Example: Waiting for the tenant to purchase a replacement tap"
                      : "Anything worth recording about this step..."
                  }
                  required={pendingAction === "hold"}
                  maxLength={pendingAction === "hold" ? 1000 : undefined}
                />
                {pendingAction === "hold" && (
                  <p className="text-xs text-muted-foreground">
                    This leaves your active queue and goes to the admin for
                    reassignment or rescheduling.
                  </p>
                )}
              </div>

              {pendingAction === "hold" && (
                <div className="space-y-3 rounded-lg border bg-background p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`supply-item-${task.id}`}>
                      Need something purchased or provided? (optional)
                    </Label>
                    <Input
                      id={`supply-item-${task.id}`}
                      value={supplyItem}
                      onChange={(event) => setSupplyItem(event.target.value)}
                      placeholder="e.g. 20m PVC pipe"
                      maxLength={200}
                    />
                  </div>
                  {supplyItem.trim() && (
                    <div className="space-y-1.5">
                      <Label htmlFor={`supply-notes-${task.id}`}>
                        Details (optional)
                      </Label>
                      <Textarea
                        id={`supply-notes-${task.id}`}
                        value={supplyNotes}
                        onChange={(event) =>
                          setSupplyNotes(event.target.value)
                        }
                        placeholder="Size, brand, where to buy, cost estimate..."
                        className="min-h-14"
                      />
                      <p className="text-xs text-muted-foreground">
                        This is sent to the admin as a request they can
                        approve or deny.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {pendingAction === "complete" && (
                <div className="space-y-2">
                  <Label>Photos of the finished work *</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={IMAGE_ACCEPT}
                    multiple
                    className="hidden"
                    onChange={addPhotos}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4" />
                      Select photos
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      JPG, PNG, GIF or WebP · up to {MAX_UPLOAD_LABEL} in total
                    </span>
                  </div>
                  {files.length === 0 && (
                    <p className="text-xs text-destructive">
                      At least one photo of the finished work is required.
                    </p>
                  )}

                  {files.length > 0 && (
                    <ul className="space-y-1">
                      {files.map((file, index) => (
                        <li
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between rounded-md bg-background px-2 py-1 text-xs"
                        >
                          <span className="truncate">{file.name}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setFiles((prev) =>
                                prev.filter((_, i) => i !== index),
                              )
                            }
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )
        )}

        {feedback && (
          <p
            className={`rounded-lg border p-3 text-sm ${
              feedback.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-destructive/30 bg-destructive/5 text-destructive"
            }`}
          >
            {feedback.message}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          {awaitingCode ? (
            <>
              <Button
                variant="ghost"
                onClick={cancelCompletion}
                disabled={isSaving}
              >
                Cancel completion
              </Button>
              <Button
                onClick={confirm}
                disabled={isSaving || code.length !== 4}
              >
                {isSaving && (
                  <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                )}
                {isSaving ? "Verifying…" : "Confirm code"}
              </Button>
            </>
          ) : pendingAction ? (
            <>
              <Button variant="ghost" onClick={reset} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                onClick={confirm}
                disabled={
                  isSaving ||
                  (pendingAction === "hold" && notes.trim().length === 0) ||
                  (pendingAction === "complete" && files.length === 0)
                }
              >
                {isSaving && (
                  <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                )}
                {isSaving
                  ? "Saving…"
                  : pendingAction === "enRoute"
                    ? "Confirm En Route"
                    : pendingAction === "startWork"
                      ? "Confirm Start Work"
                      : pendingAction === "hold"
                        ? "Confirm On Hold"
                        : "Request completion code"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setPendingAction("hold")}
              >
                <PauseCircle className="h-4 w-4" />
                Put On Hold
              </Button>
              {task.status === "pending" && (
                <Button onClick={() => setPendingAction("enRoute")}>
                  Mark as En Route
                </Button>
              )}
              {task.status === "en_route" && (
                <Button onClick={() => setPendingAction("startWork")}>
                  Start Work
                </Button>
              )}
              {task.status === "in_progress" && (
                <Button onClick={() => setPendingAction("complete")}>
                  <ShieldCheck className="h-4 w-4" />
                  Mark as Completed
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
