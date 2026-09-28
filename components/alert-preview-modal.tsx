"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Eye, Mail, MessageCircle } from "lucide-react";

import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

type Preview = {
  recipient: {
    name: string;
    role: "Tenant" | "Property owner";
    email: string | null;
    phone: string | null;
  };
  email: { subject: string; html: string };
  editable: {
    title: string;
    message: string;
    details: { label: string; value: string }[];
    emailHtmlWithNote: string;
  };
  whatsapp: { rich: string; flat: string };
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Same layout as the server's WhatsApp text (bold title, blank lines, one
 * detail per line) so the preview follows the message as it is edited. */
function richText(title: string, message: string, details: { label: string; value: string }[]) {
  const lines = details
    .filter((d) => d.value.trim())
    .map((d) => `▪️ ${d.label}: *${d.value.trim()}*`);
  return [`*${title}*`, message, lines.join("\n")].filter(Boolean).join("\n\n");
}

function flatText(title: string, message: string, details: { label: string; value: string }[]) {
  return [
    `${title}: ${message}`,
    ...details.filter((d) => d.value.trim()).map((d) => `${d.label}: ${d.value.trim()}`),
  ].join(" | ");
}

/** WhatsApp shows *bold* and _italic_ — render them the way the chat will. */
function renderWhatsAppText(text: string): ReactNode[] {
  return text.split("\n").map((line, i) => {
    const parts = line.split(/(\*[^*]+\*|_[^_]+_)/g).map((part, j) => {
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return <strong key={j}>{part.slice(1, -1)}</strong>;
      }
      if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
        return <em key={j}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
    return (
      <span key={i} className="block min-h-[1.1em]">
        {parts}
      </span>
    );
  });
}

/**
 * "Preview & send" for an alert: shows exactly what the recipient will get by
 * email and on WhatsApp, and only then offers the send button (`sendForm`,
 * a server-rendered form) — so nothing goes out unseen.
 */
export function AlertPreviewModal({
  title,
  description,
  triggerLabel,
  preview,
  action,
  hiddenFields,
  sendLabel,
  messageField = "customMessage",
  compactTrigger = false,
}: {
  title: string;
  description: string;
  triggerLabel: string;
  preview: Preview;
  /** The server action that sends; it receives the edited text as
   * `messageField` (empty/unchanged means "use the standard message"). */
  action: (formData: FormData) => void | Promise<void>;
  hiddenFields: Record<string, string>;
  sendLabel: string;
  messageField?: string;
  /** A small outlined button (for a toolbar) instead of a full-width one. */
  compactTrigger?: boolean;
}) {
  const [tab, setTab] = useState<"email" | "whatsapp">("email");
  const { recipient, editable } = preview;
  const [message, setMessage] = useState(editable.message);
  const edited = message.trim() !== editable.message.trim() && message.trim() !== "";

  const emailHtml = useMemo(
    () =>
      edited
        ? editable.emailHtmlWithNote.replace(
            "__ALERT_NOTE__",
            escapeHtml(message.trim()).replaceAll("\n", "<br>"),
          )
        : preview.email.html,
    [edited, message, editable.emailHtmlWithNote, preview.email.html],
  );
  const whatsappRich = edited
    ? richText(editable.title, message.trim(), editable.details)
    : preview.whatsapp.rich;
  const whatsappFlat = edited
    ? flatText(editable.title, message.trim(), editable.details)
    : preview.whatsapp.flat;

  return (
    <Modal
      title={title}
      description={description}
      widthClassName="max-w-2xl"
      trigger={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={compactTrigger ? "" : "w-full"}
        >
          <Eye className="h-4 w-4" />
          {triggerLabel}
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Who this goes to — the tenant or the property owner, named. */}
        <div
          className={cn(
            "flex flex-wrap items-center gap-4 rounded-xl border p-4",
            recipient.role === "Tenant"
              ? "border-emerald-200 bg-emerald-50/60"
              : "border-amber-200 bg-amber-50/60",
          )}
        >
          <span
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white",
              recipient.role === "Tenant" ? "bg-emerald-600" : "bg-amber-600",
            )}
          >
            {recipient.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              This message goes to the {recipient.role.toLowerCase()}
            </p>
            <p className="truncate text-base font-semibold text-slate-900">{recipient.name}</p>
            <span
              className={cn(
                "mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                recipient.role === "Tenant"
                  ? "bg-emerald-100 text-emerald-800 ring-emerald-300"
                  : "bg-amber-100 text-amber-800 ring-amber-300",
              )}
            >
              {recipient.role}
            </span>
          </div>
          <dl className="grid gap-1.5 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-400" />
              {recipient.email ? (
                <span className="truncate">{recipient.email}</span>
              ) : (
                <span className="text-amber-700">No email — email will be skipped</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-slate-400" />
              {recipient.phone ? (
                <span>{recipient.phone}</span>
              ) : (
                <span className="text-amber-700">No phone — WhatsApp will be skipped</span>
              )}
            </div>
          </dl>
        </div>

        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="alert-message" className="text-xs font-semibold text-slate-700">
              Message
            </label>
            {edited ? (
              <button
                type="button"
                className="text-xs font-medium text-primary underline"
                onClick={() => setMessage(editable.message)}
              >
                Reset to standard
              </button>
            ) : (
              <span className="text-[11px] text-slate-500">Edit it if you want to say something different</span>
            )}
          </div>
          <Textarea
            id="alert-message"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {(
            [
              { key: "email" as const, label: "Email", icon: Mail },
              { key: "whatsapp" as const, label: "WhatsApp", icon: MessageCircle },
            ]
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                tab === key
                  ? "bg-white text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-white/60",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === "email" ? (
          <div className="overflow-hidden rounded-xl border border-slate-300 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
              <span className="font-semibold">Subject:</span> {preview.email.subject}
            </div>
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={emailHtml}
              className="h-[26rem] w-full bg-white"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl bg-[#e5ddd5] p-4">
              <div className="max-w-md rounded-lg rounded-tl-none bg-white p-3 text-sm leading-relaxed text-slate-900 shadow">
                {renderWhatsAppText(whatsappRich)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p className="mb-1 font-semibold text-slate-700">
                If they haven&rsquo;t messaged us in the last 24 hours
              </p>
              WhatsApp only allows approved templates then, which arrive as one line:
              <p className="mt-2 rounded-md bg-white p-2 text-slate-800 ring-1 ring-slate-200">
                {whatsappFlat}
              </p>
            </div>
          </div>
        )}

        <form className="flex justify-end border-t pt-3">
          {Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <input type="hidden" name={messageField} value={edited ? message.trim() : ""} />
          <SubmitButton formAction={action} size="sm" pendingText="Sending...">
            {sendLabel}
          </SubmitButton>
        </form>
      </div>
    </Modal>
  );
}
