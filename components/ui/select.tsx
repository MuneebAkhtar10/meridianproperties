import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Plain native <select>, styled to match Input. Native is deliberate: these selects sit
 * inside progressively-enhanced forms that post to server actions.
 */
const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-10 w-full appearance-none rounded-lg border border-input bg-background bg-no-repeat px-3 py-2 text-sm",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E\")",
      backgroundPosition: "right 0.5rem center",
      backgroundSize: "1.25em 1.25em",
      paddingRight: "2.25rem",
    }}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export { Select };
