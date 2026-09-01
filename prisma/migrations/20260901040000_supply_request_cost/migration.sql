-- Records the actual price paid for an approved supply request, set once at
-- approval time and never edited afterward — the permanent cost trail for
-- what was purchased for a job, regardless of the job's later status.
ALTER TABLE "supply_requests"
  ADD COLUMN "cost" DECIMAL(14,3);
