"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Without a boundary here, anything that throws on the server leaves the tenant
 * on the framework's blank error screen — no navigation, no idea whether what
 * they submitted was saved. This at least keeps them inside the app.
 */
export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16">
      <Card>
        <CardContent className="space-y-4 p-6 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              The last action could not be completed. Check the page before
              trying again, in case it was already saved.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={reset}>Try again</Button>
            <ButtonLink href="/protected" variant="outline">
              Back to dashboard
            </ButtonLink>
          </div>
          {error.digest && (
            <p className="text-xs text-muted-foreground">
              Reference: {error.digest}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
