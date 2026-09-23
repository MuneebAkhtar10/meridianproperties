import { format, subDays } from "date-fns";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Search,
  Trash2,
  Users,
} from "lucide-react";

import { deleteCommunicationAction } from "@/app/communication-actions";
import { FormMessage, type Message } from "@/components/form-message";
import { LogConversationModal } from "@/components/log-conversation-modal";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import {
  ABOUT_LABEL,
  CHANNEL_LABEL,
  COMMUNICATION_ABOUT,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  DIRECTION_LABEL,
} from "@/lib/communication-options";
import { ensureCommunicationSchema } from "@/lib/communications";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { STAFF_ADMIN_TYPES } from "@/lib/user-roles";
import { personDisplayName } from "@/lib/utils";
import { PageProps } from "@/types/page";
import { cn } from "@/lib/utils";

const CHANNEL_ICON = {
  phone: Phone,
  in_person: Users,
  whatsapp: MessageCircle,
  sms: MessageSquare,
  email: Mail,
  other: MessageSquare,
} as const;

const CHANNEL_TONE: Record<string, string> = {
  phone: "bg-sky-50 text-sky-800",
  in_person: "bg-violet-50 text-violet-800",
  whatsapp: "bg-emerald-50 text-emerald-800",
  sms: "bg-amber-50 text-amber-800",
  email: "bg-indigo-50 text-indigo-800",
  other: "bg-slate-100 text-slate-700",
};

export default async function CommunicationsPage({ searchParams }: PageProps) {
  await requireRole(UserType.admin);
  await ensureCommunicationSchema();

  const raw = (await searchParams) as unknown as {
    q?: string;
    channel?: string;
    direction?: string;
    about?: string;
    by?: string;
  } & Message;
  const message = raw as Message;
  const q = typeof raw.q === "string" ? raw.q.trim() : "";
  const channelFilter = typeof raw.channel === "string" ? raw.channel : "all";
  const directionFilter = typeof raw.direction === "string" ? raw.direction : "all";
  const aboutFilter = typeof raw.about === "string" ? raw.about : "all";
  const byFilter = typeof raw.by === "string" ? raw.by : "all";

  const thirtyDaysAgo = subDays(new Date(), 30);

  const [
    logs,
    last30,
    loggedByHand,
    owners,
    tenants,
    workers,
    suppliers,
    staff,
  ] = await Promise.all([
    prisma.communicationLog.findMany({
      where: {
        ...(channelFilter !== "all" ? { channel: channelFilter } : {}),
        ...(directionFilter !== "all" ? { direction: directionFilter } : {}),
        ...(aboutFilter !== "all" ? { aboutKind: aboutFilter } : {}),
        ...(byFilter !== "all" ? { createdById: byFilter } : {}),
        ...(q
          ? {
              OR: [
                { partyName: { contains: q, mode: "insensitive" } },
                { subject: { contains: q, mode: "insensitive" } },
                { body: { contains: q, mode: "insensitive" } },
                { partyPhone: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { occurredAt: "desc" },
      include: {
        createdBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    }),
    prisma.communicationLog.count({
      where: { occurredAt: { gte: thirtyDaysAgo } },
    }),
    prisma.communicationLog.count(),
    prisma.user.findMany({
      where: { userType: UserType.owner },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
    prisma.user.findMany({
      where: { userType: UserType.user },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
    prisma.user.findMany({
      where: { userType: UserType.worker },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
    prisma.supplier.findMany({
      where: { active: true },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true },
    }),
    prisma.user.findMany({
      where: { userType: { in: STAFF_ADMIN_TYPES } },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);

  const partyOptions = (people: typeof owners) =>
    people.map((person) => ({
      id: person.id,
      label: personDisplayName(person),
    }));

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Communications"
        description="Everything staff logged by hand — calls, visits, WhatsApp, SMS and email."
      >
        <LogConversationModal
          owners={partyOptions(owners)}
          tenants={partyOptions(tenants)}
          workers={partyOptions(workers)}
          suppliers={suppliers.map((supplier) => ({
            id: supplier.id,
            label: supplier.companyName,
          }))}
        />
      </PageHeader>

      <FormMessage message={message} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="px-5 py-4">
          <p className="text-sm text-muted-foreground">Last 30 days</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{last30}</p>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-sm text-muted-foreground">Failed to send</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">0</p>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-sm text-muted-foreground">Logged by hand</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{loggedByHand}</p>
        </Card>
      </div>

      <form
        method="get"
        className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-2.5 sm:flex-row sm:items-center"
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search by name, subject or message"
            className="border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
          />
        </div>
        <Select name="channel" defaultValue={channelFilter} className="sm:w-[10.5rem]">
          <option value="all">All channels</option>
          {COMMUNICATION_CHANNELS.map((channel) => (
            <option key={channel.value} value={channel.value}>
              {channel.label}
            </option>
          ))}
        </Select>
        <Select name="direction" defaultValue={directionFilter} className="sm:w-[11.5rem]">
          <option value="all">All statuses</option>
          {COMMUNICATION_DIRECTIONS.map((direction) => (
            <option key={direction.value} value={direction.value}>
              {direction.label}
            </option>
          ))}
        </Select>
        <Select name="about" defaultValue={aboutFilter} className="sm:w-[9.5rem]">
          <option value="all">Anyone</option>
          {COMMUNICATION_ABOUT.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
        <Select name="by" defaultValue={byFilter} className="sm:w-[10rem]">
          <option value="all">Logged by</option>
          {staff.map((person) => (
            <option key={person.id} value={person.id}>
              {personDisplayName(person)}
            </option>
          ))}
        </Select>
        <SubmitButton variant="outline" pendingText="Filtering…">
          Filter
        </SubmitButton>
      </form>

      <p className="text-sm text-muted-foreground">
        {logs.length} {logs.length === 1 ? "entry" : "entries"}
      </p>

      {logs.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          description="Log a call, visit or message so the next person on this file can see what was agreed."
        >
          <LogConversationModal
            owners={partyOptions(owners)}
            tenants={partyOptions(tenants)}
            workers={partyOptions(workers)}
            suppliers={suppliers.map((supplier) => ({
              id: supplier.id,
              label: supplier.companyName,
            }))}
          />
        </EmptyState>
      ) : (
        <div className="space-y-2.5">
          {logs.map((log) => {
            const Icon =
              CHANNEL_ICON[log.channel as keyof typeof CHANNEL_ICON] ?? MessageSquare;
            const outbound = log.direction === "outbound";
            const DirectionIcon = outbound ? ArrowUpRight : ArrowDownLeft;
            return (
              <Card
                key={log.id}
                className="px-4 py-3.5 shadow-none transition-colors hover:border-border"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
                    )}
                  >
                    <DirectionIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          CHANNEL_TONE[log.channel] ?? CHANNEL_TONE.other,
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {CHANNEL_LABEL[log.channel] ?? log.channel}
                      </span>
                      <span className="text-sm font-semibold">{log.partyName}</span>
                      {log.partyPhone && (
                        <span className="text-sm text-muted-foreground">{log.partyPhone}</span>
                      )}
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Logged
                      </span>
                    </div>
                    <p className="text-sm font-medium">{log.subject}</p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{log.body}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {ABOUT_LABEL[log.aboutKind] ?? log.aboutKind}
                      {" · "}
                      {DIRECTION_LABEL[log.direction] ?? log.direction}
                    </p>
                  </div>
                  <div className="ml-auto flex shrink-0 items-start gap-2 text-right">
                    <div className="text-xs text-muted-foreground">
                      <div className="font-medium text-foreground/80">
                        {personDisplayName(log.createdBy)}
                      </div>
                      <div>{format(log.occurredAt, "dd/MM/yyyy HH:mm")}</div>
                    </div>
                    <form action={deleteCommunicationAction}>
                      <input type="hidden" name="id" value={log.id} />
                      <button
                        type="submit"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
