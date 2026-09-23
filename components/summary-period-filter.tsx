"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import { dateInputValue } from "@/lib/finance";
import {
  REPORT_PERIOD_LABEL,
  resolveReportPeriod,
  type ReportPeriodPreset,
} from "@/lib/report-period";

const PRESETS = Object.keys(REPORT_PERIOD_LABEL) as ReportPeriodPreset[];

export function SummaryPeriodFilter({
  preset,
  from,
  to,
}: {
  preset: ReportPeriodPreset;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState(preset);
  const [fromVal, setFromVal] = useState(from);
  const [toVal, setToVal] = useState(to);

  useEffect(() => {
    setPeriod(preset);
    setFromVal(from);
    setToVal(to);
  }, [preset, from, to]);

  function navigate(nextPeriod: ReportPeriodPreset, nextFrom: string, nextTo: string) {
    const params = new URLSearchParams({
      period: nextPeriod,
      from: nextFrom,
      to: nextTo,
    });
    router.push(`?${params.toString()}`);
  }

  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(period, fromVal, toVal);
      }}
    >
      <div className="min-w-[10rem] flex-1 space-y-1.5">
        <Label htmlFor="period" className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Period
        </Label>
        <Select
          id="period"
          name="period"
          value={period}
          onChange={(event) => {
            const next = event.target.value as ReportPeriodPreset;
            setPeriod(next);
            if (next === "custom") return;
            const range = resolveReportPeriod(next, null, null);
            const nextFrom = dateInputValue(range.from);
            const nextTo = dateInputValue(range.to);
            setFromVal(nextFrom);
            setToVal(nextTo);
            navigate(next, nextFrom, nextTo);
          }}
        >
          {PRESETS.map((option) => (
            <option key={option} value={option}>
              {REPORT_PERIOD_LABEL[option]}
            </option>
          ))}
        </Select>
      </div>
      <div className="min-w-[9.5rem] space-y-1.5">
        <Label htmlFor="from" className="text-[11px] uppercase tracking-wide text-muted-foreground">
          From
        </Label>
        <Input
          id="from"
          name="from"
          type="date"
          value={fromVal}
          onChange={(event) => {
            setFromVal(event.target.value);
            setPeriod("custom");
          }}
        />
      </div>
      <div className="min-w-[9.5rem] space-y-1.5">
        <Label htmlFor="to" className="text-[11px] uppercase tracking-wide text-muted-foreground">
          To
        </Label>
        <Input
          id="to"
          name="to"
          type="date"
          value={toVal}
          onChange={(event) => {
            setToVal(event.target.value);
            setPeriod("custom");
          }}
        />
      </div>
      <SubmitButton variant="outline" pendingText="Applying...">
        Apply
      </SubmitButton>
    </form>
  );
}
