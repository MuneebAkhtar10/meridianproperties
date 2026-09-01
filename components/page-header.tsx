import { ArrowLeft } from "lucide-react";
import { PendingLink } from "@/components/ui/pending-link";

export function PageHeader({
  title,
  description,
  back,
  children,
}: {
  title: string;
  description?: string;
  /** Optional "back to …" link shown above the title. */
  back?: { href: string; label: string };
  /** Actions, rendered on the right. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      {back && (
        <PendingLink
          href={back.href}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {back.label}
        </PendingLink>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        {children && (
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        )}
      </div>
    </div>
  );
}
