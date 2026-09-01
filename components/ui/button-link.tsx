import Link, { type LinkProps } from "next/link";

import { LinkPendingIndicator } from "@/components/link-pending-indicator";
import {
  buttonVariants,
  type ButtonVariantProps,
} from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export type ButtonLinkProps = LinkProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  ButtonVariantProps;

/** A styled Next link without a Radix Slot hydration boundary. */
export function ButtonLink({
  children,
  className,
  variant,
  size,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {children}
      <LinkPendingIndicator />
    </Link>
  );
}
