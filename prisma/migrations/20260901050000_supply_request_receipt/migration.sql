-- Lets a worker attach proof of purchase (a receipt photo/PDF) and the
-- amount they say they paid to a still-pending supply request. worker_cost
-- is only ever a suggestion for the admin — the locked, authoritative
-- number stays the existing "cost" column, set by the admin on approval.
ALTER TABLE "supply_requests"
  ADD COLUMN "worker_cost" DECIMAL(14,3),
  ADD COLUMN "receipt_path" TEXT,
  ADD COLUMN "receipt_file_name" TEXT,
  ADD COLUMN "receipt_file_type" TEXT;
