"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";

const INTERACTIVE_ELEMENT_SELECTOR =
  "a, button, input, select, textarea, summary, [role='button'], [role='link']";

function isNestedInteractiveElement(
  target: EventTarget | null,
  row: HTMLTableRowElement,
) {
  if (!(target instanceof Element)) return false;

  const interactiveElement = target.closest(INTERACTIVE_ELEMENT_SELECTOR);
  return Boolean(interactiveElement && interactiveElement !== row);
}

export function FinanceChargeRow({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  const router = useRouter();

  const openDetails = (
    event: MouseEvent<HTMLTableRowElement> | KeyboardEvent<HTMLTableRowElement>,
  ) => {
    if (
      event.defaultPrevented ||
      isNestedInteractiveElement(event.target, event.currentTarget)
    ) {
      return;
    }

    router.push(href);
  };

  return (
    <tr
      role="link"
      tabIndex={0}
      aria-label={label}
      onClick={(event) => {
        if (event.button === 0) openDetails(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") openDetails(event);
      }}
      onMouseEnter={() => router.prefetch(href)}
      onFocus={() => router.prefetch(href)}
      className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {children}
    </tr>
  );
}
