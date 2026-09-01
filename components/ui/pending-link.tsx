import Link, { type LinkProps } from "next/link";

import { LinkPendingIndicator } from "@/components/link-pending-indicator";
import { cn } from "@/lib/utils";

type PendingLinkProps = LinkProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

export function PendingLink({
  children,
  className,
  ...props
}: PendingLinkProps) {
  return (
    <Link
      className={cn("inline-flex items-center gap-1.5", className)}
      {...props}
    >
      {children}
      <LinkPendingIndicator />
    </Link>
  );
}
