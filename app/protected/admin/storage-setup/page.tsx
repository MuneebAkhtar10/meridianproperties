"use client";

import { useState } from "react";
import { Database } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function StorageSetupPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initialize = async () => {
    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/init-storage");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to initialize storage");
      }

      setResult(data.message ?? "Storage is ready.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <PageHeader
        title="Storage setup"
        description="Create the bucket that holds photo attachments."
        back={{ href: "/protected", label: "Dashboard" }}
      />

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Database className="h-5 w-5" />
            </span>
            <p className="text-sm text-muted-foreground">
              Photos attached to maintenance requests are kept in a private
              Supabase Storage bucket. This creates it if it does not exist
              yet. It is safe to run more than once, and the bucket is
              created automatically on the first upload anyway.
            </p>
          </div>

          <Button onClick={initialize} disabled={isLoading}>
            {isLoading ? "Checking..." : "Initialize storage"}
          </Button>

          {result && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {result}
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
