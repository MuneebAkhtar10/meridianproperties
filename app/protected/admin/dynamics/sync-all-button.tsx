"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { syncAllPaymentsAction } from "@/app/dynamics-actions";

/** Catches up any approved payment that predates the integration, or was missed during an outage. */
export function SyncAllButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setSummary(null);
    try {
      const result = await syncAllPaymentsAction();
      setSummary(
        `${result.created} created, ${result.alreadySynced} already synced` +
          (result.failed ? `, ${result.failed} failed` : ""),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button onClick={run} disabled={busy} size="sm" variant="outline">
        <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Syncing…" : "Sync now"}
      </Button>
      {summary && (
        <span className="text-xs text-muted-foreground">{summary}</span>
      )}
    </div>
  );
}
