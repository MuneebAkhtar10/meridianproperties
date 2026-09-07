"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Home,
  LoaderCircle,
  MapPin,
  Paperclip,
  PauseCircle,
  PlayCircle,
  Receipt,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/finance";
import { PriorityBadge } from "@/lib/status";
import { formatUnitLabel } from "@/lib/property-types";
import type { RequestWithPlace, SupplyRequestWithUsers } from "@/types/maintenance";

type StatusResult = { ok: boolean; message: string };

/**
 * A job the worker put on hold. It has left the active "My tasks" queue (see
 * app/protected/tasks/page.tsx), so this is the worker's only view into what
 * happens next: the hold reason, any supply request and its outcome, a way
 * to ask for something else, and the "I'm ready" signal once they actually
 * have what they need — admin still picks the worker and restarts the job.
 */
export function HeldTaskCard({
  task,
  onAddSupplyRequest,
  onReadyToResume,
  onUploadReceipt,
}: {
  task: RequestWithPlace;
  onAddSupplyRequest: (
    taskId: string,
    item: string,
    notes: string,
  ) => Promise<StatusResult>;
  onReadyToResume: (taskId: string) => Promise<StatusResult>;
  onUploadReceipt: (
    supplyRequestId: string,
    receipt: File,
    workerCost: string,
  ) => Promise<StatusResult>;
}) {
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [item, setItem] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<StatusResult | null>(null);
  const router = useRouter();

  const supplyRequests = task.supplyRequests ?? [];
  const hasPendingRequest = supplyRequests.some((r) => r.status === "pending");

  const showResult = (result: StatusResult) => {
    setMessage(result);
    if (result.ok) {
      router.refresh();
    }
    setTimeout(() => setMessage(null), 6000);
  };

  const submitRequest = async () => {
    setIsSaving(true);
    try {
      const result = await onAddSupplyRequest(task.id, item, notes);
      showResult(result);
      if (result.ok) {
        setShowRequestForm(false);
        setItem("");
        setNotes("");
      }
    } catch {
      showResult({ ok: false, message: "Could not send the request." });
    } finally {
      setIsSaving(false);
    }
  };

  const readyToResume = async () => {
    setIsSaving(true);
    try {
      showResult(await onReadyToResume(task.id));
    } catch {
      showResult({ ok: false, message: "Could not notify the admin." });
    } finally {
      setIsSaving(false);
    }
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
                  : "No unit linked"}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {task.location}
              </span>
            </div>
          </div>
          <PriorityBadge priority={task.priority} />
        </div>

        <div className="space-y-2 rounded-lg border border-[#dc961e]/30 bg-[#dc961e]/10 p-4 text-[#8a5c10]">
          <div className="flex items-center gap-2 font-medium">
            <PauseCircle className="h-4 w-4" />
            On hold — waiting for admin
          </div>
          <p className="whitespace-pre-wrap text-sm">
            {task.holdReason ?? "No hold reason was recorded."}
          </p>
          {task.resumeRequestedAt && (
            <p className="text-xs font-semibold">
              Admin has been notified that you&apos;re ready to resume.
            </p>
          )}
        </div>

        {supplyRequests.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Supply requests
            </p>
            {supplyRequests.map((request) => (
              <WorkerSupplyRequestRow
                key={request.id}
                request={request}
                onUploadReceipt={onUploadReceipt}
                onDone={showResult}
              />
            ))}
          </div>
        )}

        {showRequestForm ? (
          <div className="space-y-3 rounded-lg bg-muted/40 p-3">
            <div className="space-y-1.5">
              <Label htmlFor={`add-item-${task.id}`}>What do you need?</Label>
              <Input
                id={`add-item-${task.id}`}
                value={item}
                onChange={(event) => setItem(event.target.value)}
                placeholder="e.g. Replacement water heater"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`add-notes-${task.id}`}>
                Details (optional)
              </Label>
              <Textarea
                id={`add-notes-${task.id}`}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Size, brand, where to buy, cost estimate..."
                className="min-h-14"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowRequestForm(false);
                  setItem("");
                  setNotes("");
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={submitRequest}
                disabled={isSaving || !item.trim()}
              >
                {isSaving && (
                  <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                )}
                {isSaving ? "Sending…" : "Send request"}
              </Button>
            </div>
          </div>
        ) : (
          message && (
            <p
              className={`rounded-lg border p-3 text-sm ${
                message.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-destructive/30 bg-destructive/5 text-destructive"
              }`}
            >
              {message.message}
            </p>
          )
        )}

        {!showRequestForm && (
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowRequestForm(true)}
              disabled={isSaving || hasPendingRequest}
            >
              Request something else
            </Button>
            <Button
              type="button"
              onClick={readyToResume}
              disabled={isSaving || Boolean(task.resumeRequestedAt)}
            >
              {isSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              {task.resumeRequestedAt
                ? "Admin notified"
                : "I'm ready to resume"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** One supply request in the worker's held-task view, with its own
 * "attach receipt" form — kept separate so opening the upload form on one
 * request doesn't affect any other request on the same card. */
function WorkerSupplyRequestRow({
  request,
  onUploadReceipt,
  onDone,
}: {
  request: SupplyRequestWithUsers;
  onUploadReceipt: (
    supplyRequestId: string,
    receipt: File,
    workerCost: string,
  ) => Promise<StatusResult>;
  onDone: (result: StatusResult) => void;
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [workerCost, setWorkerCost] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasReceipt = Boolean(request.receiptPath);

  const submitReceipt = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      onDone({ ok: false, message: "Choose a receipt photo or PDF first." });
      return;
    }
    setIsUploading(true);
    try {
      const result = await onUploadReceipt(request.id, file, workerCost);
      onDone(result);
      if (result.ok) {
        setShowUpload(false);
        setWorkerCost("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch {
      onDone({ ok: false, message: "Could not upload the receipt." });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-1 rounded-lg border p-3 text-sm">
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
        <p className="text-xs text-muted-foreground">{request.notes}</p>
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

      {hasReceipt ? (
        <a
          href={`/api/supply-receipt/${request.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary underline"
        >
          <Receipt className="h-3 w-3" />
          View uploaded receipt
          {request.workerCost != null
            ? ` · you paid ${formatMoney(request.workerCost)}`
            : ""}
        </a>
      ) : (
        request.status === "pending" &&
        (showUpload ? (
          <div className="space-y-2 rounded-md bg-muted/40 p-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Receipt (photo or PDF)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">What did you pay? (optional)</Label>
              <Input
                type="number"
                min="0"
                step="0.001"
                inputMode="decimal"
                value={workerCost}
                onChange={(event) => setWorkerCost(event.target.value)}
                placeholder="0.000"
                className="h-8 w-32 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowUpload(false);
                  setWorkerCost("");
                }}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={submitReceipt}
                disabled={isUploading}
              >
                {isUploading && (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                )}
                {isUploading ? "Uploading…" : "Upload"}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowUpload(true)}
          >
            <Paperclip className="h-3.5 w-3.5" />
            I already bought this — attach receipt
          </Button>
        ))
      )}
    </div>
  );
}
