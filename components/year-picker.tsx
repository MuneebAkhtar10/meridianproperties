"use client";

import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";

/** A plain year <select> that navigates to `${basePath}/${year}` on
 * change — small client boundary so the Annual Budget page itself can stay
 * a server component. */
export function YearPicker({
  basePath,
  year,
  years,
}: {
  basePath: string;
  year: number;
  years: number[];
}) {
  const router = useRouter();

  return (
    <Select
      defaultValue={String(year)}
      onChange={(e) => router.push(`${basePath}/${e.target.value}`)}
      className="w-28"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </Select>
  );
}
