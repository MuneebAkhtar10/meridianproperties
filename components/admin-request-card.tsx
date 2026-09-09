"use client";

import { useRef, useState } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Home,
  Image as ImageIcon,
  LoaderCircle,
  MapPin,
  Paperclip,
  PauseCircle,
  PlayCircle,
  Receipt,
  User,
  UserCog,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";

import {
  assignWorkerAction,
  decideSupplyRequestAction,
  holdTaskAction,
  resumeHeldTaskAction,
  uploadSupplyReceiptAction,
} from "@/app/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { PendingLink } from "@/components/ui/pending-link";
import { PriorityBadge, STATUS_META, StatusBadge } from "@/lib/status";
import { attachmentUrl } from "@/lib/utils";
import { formatMoney } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import type {
  Attachment,
  RequestWithPlace,
  SupplyRequestWithUsers,
} from "@/types/maintenance";

export function AdminRequestCard({
  request,
  workers,
  attachments = [],
  isAdmin = true,
}: {
  request: RequestWithPlace;
  workers: {
    id: string;
    email: string;
    workerCategory: "in_house" | "third_party" | null;
    companyName: string | null;
  }[];
  attachments?: Attachment[];
  /** Property owners get a read-only view — no assign/hold/supply controls. */
  isAdmin?: boolean;
}) {
  const inHouseWorkers = workers.filter(
    (worker) => worker.workerCategory !== "third_party",
  );
  const thirdPartyWorkers = workers.filter(
    (worker) => worker.workerCategory === "third_party",
  );
  const workerLabel = (worker: (typeof workers)[number]) =>
    worker.workerCategory === "third_party" && worker.companyName
      ? `${worker.email} (${worker.companyName})`
      : worker.email;
  const [message, setMessage] = useState<string | null>(null);
  const [showHoldForm, setShowHoldForm] = useState(false);
  const [holdReason, setHoldReason] = useState("");
  const [resumeNotes, setResumeNotes] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState(
    request.assignedToId ?? "",
  );
  const [isHoldSaving, setIsHoldSaving] = useState(false);
  const router = useRouter();

  const preview = attachments.slice(0, 3);
  const extra = attachments.length - preview.length;
  const isHeld = request.status === "on_hold";
  const pendingSupplyCount =
    request.supplyRequests?.filter((sr) => sr.status === "pending").length ??
    0;
  // Collapsed by default so a long list of requests fits without scrolling
  // past each one — anything needing attention right away starts expanded.
  const [expanded, setExpanded] = useState(isHeld || pendingSupplyCount > 0);
  const assignedWorker = workers.find((w) => w.id === request.assignedToId);

  const showResult = (result: { ok: boolean; message: string }) => {
    setMessage(result.message);
    if (result.ok) {
      router.refresh();
    }
    setTimeout(() => setMessage(null), 5000);
  };

  const putOnHold = async () => {
    setIsHoldSaving(true);
    const formData = new FormData();
    formData.append("taskId", request.id);
    formData.append("reason", holdReason);

    try {
      const result = await holdTaskAction(formData);
      showResult(result);
      if (result.ok) {
        setShowHoldForm(false);
        setHoldReason("");
      }
    } catch {
      showResult({ ok: false, message: "Could not put this job on hold." });
    } finally {
      setIsHoldSaving(false);
    }
  };

  const assignAndResume = async () => {
    setIsHoldSaving(true);
    const formData = new FormData();
    formData.append("taskId", request.id);
    formData.append("workerId", selectedWorkerId);
    formData.append("notes", resumeNotes);

    try {
      const result = await resumeHeldTaskAction(formData);
      showResult(result);
    } catch {
      showResult({ ok: false, message: "Could not resume this job." });
    } finally {
      setIsHoldSaving(false);
    }
  };

  const statusMeta = STATUS_META[request.status];
  const initials = (assignedWorker?.email ?? request.user.email)
    .slice(0, 2)
    .toUpperCase();

  return (
    <Card className="overflow-hidden border-border/60 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex">
        <span
          aria-hidden
          className={`w-1.5 shrink-0 ${statusMeta.dot}`}
        />
        <CardContent className="min-w-0 flex-1 space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold leading-tight tracking-tight">
                  {request.title}
                </h3>
                <PendingLink
                  href={`/protected/maintenance/${request.id}`}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Details
                  <ExternalLink className="h-3 w-3" />
                </PendingLink>
              </div>

              {/* Where a worker actually has to go. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 font-medium text-foreground">
                  <Home className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {request.unit
                    ? `${request.unit.property.name} · ${formatUnitLabel(
                        request.unit.property.propertyType,
                        request.unit.label,
                      )}`
                    : request.property
                      ? `${request.property.name} · Common area`
                      : "No unit linked"}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {request.location}
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  {request.user.email}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <PriorityBadge priority={request.priority} />
              <StatusBadge status={request.status} />
            </div>
          </div>

          {/* Compact summary bar — always visible; the heavier controls below
              only render once expanded, so a long list of requests scans in a
              fraction of the space it used to take. */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-left text-xs transition-colors hover:border-border hover:bg-muted/60"
          >
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                    assignedWorker
                      ? "bg-slate-200 text-slate-700"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {assignedWorker ? initials : <UserCog className="h-3 w-3" />}
                </span>
                {assignedWorker ? workerLabel(assignedWorker) : "Unassigned"}
              </span>
              {pendingSupplyCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  {pendingSupplyCount} supply request
                  {pendingSupplyCount === 1 ? "" : "s"} pending
                </span>
              )}
              <span>Reported {format(request.createdAt, "d MMM yyyy")}</span>
              {request.createdBy && (
                <span>Added by {request.createdBy.email}</span>
              )}
            </span>
            <span className="flex items-center gap-1 rounded-md border border-border/60 bg-background px-2.5 py-1 font-medium text-foreground shadow-sm">
              {expanded ? "Hide" : "Manage"}
              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </span>
          </button>

        {expanded && (
          <p className="text-sm text-muted-foreground">
            {request.description.length > 240
              ? `${request.description.slice(0, 240)}…`
              : request.description}
          </p>
        )}

        {expanded && isHeld && (
          <div className="space-y-2 rounded-lg border border-[#dc961e]/30 bg-[#dc961e]/10 p-4 text-[#8a5c10]">
            <div className="flex items-center gap-2 font-medium">
              <PauseCircle className="h-4 w-4" />
              Waiting for admin review
            </div>
            <p className="whitespace-pre-wrap text-sm">
              {request.holdReason ?? "No hold reason was recorded."}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#8a5c10]/80">
              {request.heldAt && (
                <span>Held {format(request.heldAt, "d MMM, HH:mm")}</span>
              )}
              {request.resumeRequestedAt && (
                <span className="font-semibold">
                  {request.user.email} says the blocker is resolved
                </span>
              )}
            </div>
          </div>
        )}

        {expanded && (request.supplyRequests?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Supply requests
            </p>
            {request.supplyRequests!.map((supplyRequest) => (
              <SupplyRequestRow
                key={supplyRequest.id}
                supplyRequest={supplyRequest}
                onDecided={showResult}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}

        {expanded && preview.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {preview.map((attachment) => (
              <a
                key={attachment.id}
                href={attachmentUrl(attachment.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="h-16 w-16 overflow-hidden rounded-lg border bg-muted"
              >
                {attachment.fileType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={attachmentUrl(attachment.id)}
                    alt={attachment.fileName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </span>
                )}
              </a>
            ))}
            {extra > 0 && (
              <span className="flex h-16 w-16 items-center justify-center rounded-lg border bg-muted text-xs text-muted-foreground">
                +{extra}
              </span>
            )}
          </div>
        )}

        {expanded && !isAdmin && (
          <p className="border-t pt-4 text-xs text-muted-foreground">
            {isHeld
              ? "On hold, pending admin review."
              : `${assignedWorker ? workerLabel(assignedWorker) : "No worker"} assigned · ${STATUS_META[request.status].label}`}
          </p>
        )}

        {expanded && isAdmin && (isHeld ? (
          <div className="space-y-4 border-t pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`resume-worker-${request.id}`}>
                  Worker for resumed job
                </Label>
                <Select
                  id={`resume-worker-${request.id}`}
                  value={selectedWorkerId}
                  onChange={(event) => setSelectedWorkerId(event.target.value)}
                >
                  <option value="">— Choose a worker —</option>
                  {inHouseWorkers.length > 0 && (
                    <optgroup label="In-house">
                      {inHouseWorkers.map((worker) => (
                        <option key={worker.id} value={worker.id}>
                          {workerLabel(worker)}
                          {worker.id === request.assignedToId
                            ? " (previous worker)"
                            : ""}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {thirdPartyWorkers.length > 0 && (
                    <optgroup label="3rd-party">
                      {thirdPartyWorkers.map((worker) => (
                        <option key={worker.id} value={worker.id}>
                          {workerLabel(worker)}
                          {worker.id === request.assignedToId
                            ? " (previous worker)"
                            : ""}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`resume-notes-${request.id}`}>
                  Resume note (optional)
                </Label>
                <Textarea
                  id={`resume-notes-${request.id}`}
                  value={resumeNotes}
                  onChange={(event) => setResumeNotes(event.target.value)}
                  placeholder="What was resolved?"
                  className="min-h-10"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xl text-xs text-muted-foreground">
                The previous worker continues from the earlier stage. Choosing a
                different worker restarts the job as Pending.
              </p>
              <Button
                type="button"
                onClick={assignAndResume}
                disabled={isHoldSaving || !selectedWorkerId}
              >
                {isHoldSaving ? (
                  <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <PlayCircle className="h-4 w-4" />
                )}
                {isHoldSaving ? "Resuming…" : "Assign & Resume"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <form
              key={`${request.assignedToId ?? ""}-${request.status}`}
              action={async (formData) => {
                try {
                  await assignWorkerAction(formData);
                  // This action is invoked manually, so refresh the client route
                  // after the server cache has been revalidated.
                  router.refresh();
                  setMessage("Saved");
                } catch {
                  setMessage("Something went wrong");
                }
                setTimeout(() => setMessage(null), 3000);
              }}
              className="flex flex-wrap items-end gap-3 border-t pt-4"
            >
              <input type="hidden" name="requestId" value={request.id} />

              <div className="min-w-48 flex-1 space-y-1.5">
                <Label htmlFor={`worker-${request.id}`} className="text-xs">
                  Assign to worker
                </Label>
                <Select
                  id={`worker-${request.id}`}
                  name="workerId"
                  defaultValue={request.assignedToId ?? ""}
                  className="h-9 text-sm"
                >
                  <option value="">— Unassigned —</option>
                  {inHouseWorkers.length > 0 && (
                    <optgroup label="In-house">
                      {inHouseWorkers.map((worker) => (
                        <option key={worker.id} value={worker.id}>
                          {workerLabel(worker)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {thirdPartyWorkers.length > 0 && (
                    <optgroup label="3rd-party">
                      {thirdPartyWorkers.map((worker) => (
                        <option key={worker.id} value={worker.id}>
                          {workerLabel(worker)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`status-${request.id}`} className="text-xs">
                  Status
                </Label>
                <Select
                  id={`status-${request.id}`}
                  name="status"
                  defaultValue={request.status}
                  className="h-9 w-36 text-sm"
                >
                  <option value="pending">Pending</option>
                  <option value="en_route">En Route</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </Select>
              </div>

              <SubmitButton size="sm" pendingText="Saving...">
                Update
              </SubmitButton>
            </form>

            {request.status !== "completed" && (
              <div className="border-t pt-4">
                {showHoldForm ? (
                  <div className="space-y-3 rounded-lg bg-muted/40 p-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`hold-reason-${request.id}`}>
                        Why is this job on hold?
                      </Label>
                      <Textarea
                        id={`hold-reason-${request.id}`}
                        value={holdReason}
                        onChange={(event) => setHoldReason(event.target.value)}
                        placeholder="Example: Waiting for a replacement part from the tenant"
                        maxLength={1000}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setShowHoldForm(false);
                          setHoldReason("");
                        }}
                        disabled={isHoldSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={putOnHold}
                        disabled={isHoldSaving || !holdReason.trim()}
                      >
                        {isHoldSaving && (
                          <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                        )}
                        {isHoldSaving ? "Saving…" : "Confirm On Hold"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowHoldForm(true)}
                  >
                    <PauseCircle className="h-4 w-4" />
                    Put On Hold
                  </Button>
                )}
              </div>
            )}
          </>
        ))}

        {message && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">{message}</p>
        )}

          {expanded && request.completedAt && (
            <p className="text-xs text-muted-foreground">
              Completed {format(request.completedAt, "PPP")}
            </p>
          )}
        </CardContent>
      </div>
    </Card>
  );
}

/** One supply request with its own approve/deny controls and note field —
 * kept separate so typing a note on one request never leaks into another
 * pending request on the same job. */
function SupplyRequestRow({
  supplyRequest,
  onDecided,
  isAdmin = true,
}: {
  supplyRequest: SupplyRequestWithUsers;
  onDecided: (result: { ok: boolean; message: string }) => void;
  isAdmin?: boolean;
}) {
  const [note, setNote] = useState("");
  const [cost, setCost] = useState(
    supplyRequest.workerCost != null ? String(supplyRequest.workerCost) : "",
  );
  const [denying, setDenying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [receiptCost, setReceiptCost] = useState(
    supplyRequest.workerCost != null ? String(supplyRequest.workerCost) : "",
  );
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadReceipt = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      onDecided({ ok: false, message: "Choose a receipt photo or PDF first." });
      return;
    }
    setIsUploading(true);
    const formData = new FormData();
    formData.append("supplyRequestId", supplyRequest.id);
    formData.append("receipt", file);
    if (receiptCost.trim()) {
      formData.append("workerCost", receiptCost.trim());
    }

    try {
      const result = await uploadSupplyReceiptAction(formData);
      onDecided(result);
      if (result.ok) {
        setShowUpload(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch {
      onDecided({ ok: false, message: "Could not upload the receipt." });
    } finally {
      setIsUploading(false);
    }
  };

  const decide = async (decision: "approved" | "denied") => {
    setIsSaving(true);
    const formData = new FormData();
    formData.append("supplyRequestId", supplyRequest.id);
    formData.append("decision", decision);
    if (note.trim()) {
      formData.append("adminNote", note.trim());
    }
    if (decision === "approved" && cost.trim()) {
      formData.append("cost", cost.trim());
    }

    try {
      const result = await decideSupplyRequestAction(formData);
      onDecided(result);
      if (result.ok) {
        setDenying(false);
        setNote("");
        setCost("");
      }
    } catch {
      onDecided({ ok: false, message: "Could not save this decision." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium">{supplyRequest.item}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            requested by {supplyRequest.requestedBy.email}
          </span>
        </div>
        {supplyRequest.status === "pending" && (
          <span className="inline-flex items-center rounded-full bg-[#0886be]/10 px-2 py-0.5 text-xs font-medium text-[#0886be] ring-1 ring-inset ring-[#0886be]/20">
            Pending
          </span>
        )}
        {supplyRequest.status === "approved" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <CheckCircle2 className="h-3 w-3" />
            Approved
          </span>
        )}
        {supplyRequest.status === "denied" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
            <XCircle className="h-3 w-3" />
            Denied
          </span>
        )}
      </div>

      {supplyRequest.notes && (
        <p className="text-xs text-muted-foreground">{supplyRequest.notes}</p>
      )}

      {supplyRequest.receiptPath ? (
        <a
          href={`/api/supply-receipt/${supplyRequest.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary underline"
        >
          <Receipt className="h-3 w-3" />
          View uploaded receipt
          {supplyRequest.workerCost != null
            ? ` · paid ${formatMoney(supplyRequest.workerCost)}`
            : ""}
        </a>
      ) : (
        isAdmin &&
        supplyRequest.status === "pending" &&
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
              <Label className="text-xs">Amount paid (optional)</Label>
              <Input
                type="number"
                min="0"
                step="0.001"
                inputMode="decimal"
                value={receiptCost}
                onChange={(event) => setReceiptCost(event.target.value)}
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
                  setReceiptCost(
                    supplyRequest.workerCost != null
                      ? String(supplyRequest.workerCost)
                      : "",
                  );
                }}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={uploadReceipt}
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
            Attach receipt
          </Button>
        ))
      )}

      {supplyRequest.adminNote && (
        <p className="text-xs text-muted-foreground">
          Your note: {supplyRequest.adminNote}
        </p>
      )}

      {supplyRequest.status === "approved" && supplyRequest.cost != null && (
        <p className="text-xs font-medium text-emerald-700">
          Cost: {formatMoney(supplyRequest.cost)}
        </p>
      )}

      {supplyRequest.status === "pending" && isAdmin && (
        <div className="space-y-2">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              denying
                ? "Reason for denying (required)"
                : 'Note (optional) — e.g. "Picked up, ready for you"'
            }
            className="min-h-10 text-xs"
          />
          {!denying && (
            <div className="space-y-1">
              <Label
                htmlFor={`supply-cost-${supplyRequest.id}`}
                className="text-xs text-muted-foreground"
              >
                Cost (OMR, optional) — locked once approved
              </Label>
              <Input
                id={`supply-cost-${supplyRequest.id}`}
                type="number"
                min="0"
                step="0.001"
                inputMode="decimal"
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                placeholder="0.000"
                className="h-8 w-32 text-xs"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            {denying ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDenying(false);
                    setNote("");
                  }}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-rose-700"
                  onClick={() => decide("denied")}
                  disabled={isSaving || !note.trim()}
                >
                  Confirm deny
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-rose-700"
                  onClick={() => {
                    setDenying(true);
                    setNote("");
                  }}
                  disabled={isSaving}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Deny
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => decide("approved")}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Approve
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
