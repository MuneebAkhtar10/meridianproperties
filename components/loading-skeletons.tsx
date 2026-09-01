import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function LoadingRegion({
  children,
  maxWidth = "max-w-6xl",
}: {
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Loading page"
      aria-live="polite"
      className={cn("mx-auto w-full space-y-8 px-4 py-8", maxWidth)}
    >
      <span className="sr-only">Loading page…</span>
      {children}
    </div>
  );
}

function HeaderSkeleton({ actions = 0 }: { actions?: number }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72 max-w-[70vw]" />
      </div>
      {actions > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: actions }, (_, index) => (
            <Skeleton key={index} className="h-10 w-28" />
          ))}
        </div>
      )}
    </div>
  );
}

function StatSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  );
}

function CardRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 rounded-lg border p-4"
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function SidebarFormSkeleton() {
  return (
    <Card className="h-fit">
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

export function DashboardLoadingSkeleton() {
  return (
    <LoadingRegion>
      <HeaderSkeleton actions={2} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <StatSkeleton key={index} />
        ))}
      </div>
      <Card>
        <CardContent className="grid gap-6 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-6 w-32" />
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((column) => (
          <Card key={column}>
            <CardHeader>
              <Skeleton className="h-5 w-36" />
            </CardHeader>
            <CardContent>
              <CardRows rows={4} />
            </CardContent>
          </Card>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function ListLoadingSkeleton({
  maxWidth = "max-w-6xl",
  withStats = false,
  withSidebar = false,
  rows = 5,
}: {
  maxWidth?: string;
  withStats?: boolean;
  withSidebar?: boolean;
  rows?: number;
}) {
  return (
    <LoadingRegion maxWidth={maxWidth}>
      <HeaderSkeleton actions={1} />
      {withStats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <StatSkeleton key={index} />
          ))}
        </div>
      )}
      <div
        className={cn("grid gap-8", withSidebar && "lg:grid-cols-[1fr_22rem]")}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-20" />
            ))}
          </div>
          <Card>
            <CardContent className="p-4">
              <CardRows rows={rows} />
            </CardContent>
          </Card>
        </div>
        {withSidebar && <SidebarFormSkeleton />}
      </div>
    </LoadingRegion>
  );
}

export function DetailLoadingSkeleton({
  maxWidth = "max-w-5xl",
  withSidebar = true,
}: {
  maxWidth?: string;
  withSidebar?: boolean;
}) {
  return (
    <LoadingRegion maxWidth={maxWidth}>
      <Skeleton className="h-4 w-28" />
      <HeaderSkeleton actions={1} />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <StatSkeleton key={index} />
        ))}
      </div>
      <div
        className={cn("grid gap-8", withSidebar && "lg:grid-cols-[1fr_20rem]")}
      >
        <div className="space-y-6">
          {[0, 1].map((section) => (
            <Card key={section}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        {withSidebar && <SidebarFormSkeleton />}
      </div>
    </LoadingRegion>
  );
}

export function FormLoadingSkeleton({ maxWidth = "max-w-2xl" } = {}) {
  return (
    <LoadingRegion maxWidth={maxWidth}>
      <Skeleton className="h-4 w-28" />
      <HeaderSkeleton />
      <Card>
        <CardContent className="space-y-5 p-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton
                className={index === 3 ? "h-28 w-full" : "h-10 w-full"}
              />
            </div>
          ))}
          <Skeleton className="h-10 w-36" />
        </CardContent>
      </Card>
    </LoadingRegion>
  );
}
