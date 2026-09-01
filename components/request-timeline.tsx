import { format } from "date-fns";

import { STATUS_META, STATUS_ORDER } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { RequestStatus, TaskLog } from "@/lib/generated/prisma/client";

/** Normal progress stays linear; hold events are shown separately as interruptions. */
export function RequestTimeline({
  currentStatus,
  logs,
}: {
  currentStatus: RequestStatus;
  logs: (TaskLog & { changedBy?: { email: string } | null })[];
}) {
  const latestProgressStatus =
    [...logs].reverse().find((log) => log.status !== "on_hold")?.status ??
    "pending";
  const effectiveStatus =
    currentStatus === "on_hold" ? latestProgressStatus : currentStatus;
  const currentIndex = Math.max(0, STATUS_ORDER.indexOf(effectiveStatus));
  const holdEntries = logs.filter((log) => log.status === "on_hold");
  const holdMeta = STATUS_META.on_hold;
  const HoldIcon = holdMeta.icon;

  return (
    <div className="space-y-5">
      {holdEntries.length > 0 && (
        <div className={cn("rounded-lg p-3 ring-1 ring-inset", holdMeta.pill)}>
          <div className="flex items-center gap-2 text-sm font-medium">
            <HoldIcon className="h-4 w-4" />
            Hold history
          </div>
          <ul className="mt-2 space-y-1">
            {holdEntries.map((log) => (
              <li key={log.id} className="text-xs">
                {log.notes}
                <span className="ml-1 opacity-70">
                  · {format(log.createdAt, "d MMM, HH:mm")}
                  {log.changedBy ? ` · ${log.changedBy.email}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="space-y-0">
        {STATUS_ORDER.map((status, index) => {
          const meta = STATUS_META[status];
          const Icon = meta.icon;
          const reached = index <= currentIndex;
          const isLast = index === STATUS_ORDER.length - 1;

          // Every log recorded while the request was at this step.
          const entries = logs.filter((log) => log.status === status);

          return (
            <li key={status} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
                    reached
                      ? meta.pill
                      : "bg-muted text-muted-foreground ring-border",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>

                {!isLast && (
                  <span
                    className={cn(
                      "my-1 w-px flex-1",
                      index < currentIndex ? meta.dot : "bg-border",
                    )}
                  />
                )}
              </div>

              <div className={cn("pb-6", isLast && "pb-0")}>
                <p
                  className={cn(
                    "text-sm font-medium",
                    !reached && "text-muted-foreground",
                  )}
                >
                  {meta.label}
                </p>

                {entries.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {entries.map((log) => (
                      <li
                        key={log.id}
                        className="text-xs text-muted-foreground"
                      >
                        {log.notes}
                        <span className="ml-1 opacity-70">
                          · {format(log.createdAt, "d MMM, HH:mm")}
                          {log.changedBy ? ` · ${log.changedBy.email}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {reached ? "Done" : "Not yet"}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
