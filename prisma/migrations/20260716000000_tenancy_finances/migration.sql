-- Tenant lifecycle and auditable, gateway-free rent/bill tracking.

CREATE TYPE "ChargeType" AS ENUM (
  'rent', 'electricity', 'gas', 'water', 'internet', 'maintenance', 'municipality_fee', 'deposit', 'other'
);

CREATE TYPE "ChargeStatus" AS ENUM ('open', 'paid', 'waived');
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "PaymentMethod" AS ENUM (
  'cash', 'bank_transfer', 'oman_net', 'mobile_payment', 'direct_debit', 'cheque', 'other'
);
CREATE TYPE "TenancyPurpose" AS ENUM ('residential', 'commercial');
CREATE TYPE "FinancialDocumentKind" AS ENUM ('bill', 'receipt');

ALTER TABLE "notifications" ADD COLUMN "href" TEXT;

ALTER TABLE "properties" RENAME COLUMN "city" TO "wilayat";
ALTER TABLE "properties"
  ADD COLUMN "governorate" TEXT,
  ADD COLUMN "area" TEXT,
  ADD COLUMN "way_number" TEXT,
  ADD COLUMN "building_number" TEXT,
  ADD COLUMN "postal_code" TEXT,
  ADD COLUMN "title_deed_number" TEXT,
  ADD COLUMN "plot_number" TEXT;

ALTER TABLE "users"
  ADD COLUMN "civil_id" TEXT,
  ADD COLUMN "nationality" TEXT,
  ADD COLUMN "employer" TEXT,
  ADD COLUMN "emergency_contact_name" TEXT,
  ADD COLUMN "emergency_contact_phone" TEXT;
CREATE UNIQUE INDEX "users_civil_id_key" ON "users"("civil_id");

CREATE TABLE "tenancies" (
  "id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE,
  "lease_end_date" DATE,
  "monthly_rent" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "rent_due_day" INTEGER NOT NULL DEFAULT 5,
  "security_deposit" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "purpose" "TenancyPurpose" NOT NULL DEFAULT 'residential',
  "agreement_ref" TEXT,
  "municipality_contract_number" TEXT,
  "contract_registered_at" DATE,
  "electricity_account_number" TEXT,
  "water_account_number" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tenancies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenancies_rent_due_day_check" CHECK ("rent_due_day" BETWEEN 1 AND 28),
  CONSTRAINT "tenancies_monthly_rent_check" CHECK ("monthly_rent" >= 0),
  CONSTRAINT "tenancies_security_deposit_check" CHECK ("security_deposit" >= 0),
  CONSTRAINT "tenancies_dates_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date")
);

CREATE TABLE "charges" (
  "id" UUID NOT NULL,
  "tenancy_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "type" "ChargeType" NOT NULL,
  "title" TEXT NOT NULL,
  "amount" DECIMAL(14,3) NOT NULL,
  "due_date" DATE NOT NULL,
  "period_start" DATE,
  "status" "ChargeStatus" NOT NULL DEFAULT 'open',
  "notes" TEXT,
  "rent_key" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "charges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "charges_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "payments" (
  "id" UUID NOT NULL,
  "charge_id" UUID NOT NULL,
  "amount" DECIMAL(14,3) NOT NULL,
  "paid_at" DATE NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
  "submitted_by" UUID NOT NULL,
  "reviewed_by" UUID,
  "reviewed_at" TIMESTAMP(3),
  "review_notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "financial_attachments" (
  "id" UUID NOT NULL,
  "charge_id" UUID,
  "payment_id" UUID,
  "kind" "FinancialDocumentKind" NOT NULL,
  "file_name" TEXT NOT NULL,
  "file_path" TEXT NOT NULL,
  "file_type" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "uploaded_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "financial_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_attachments_owner_check" CHECK (num_nonnulls("charge_id", "payment_id") = 1)
);

CREATE UNIQUE INDEX "charges_rent_key_key" ON "charges"("rent_key");
CREATE INDEX "tenancies_unit_id_end_date_idx" ON "tenancies"("unit_id", "end_date");
CREATE INDEX "tenancies_tenant_id_end_date_idx" ON "tenancies"("tenant_id", "end_date");
CREATE INDEX "charges_tenant_id_status_due_date_idx" ON "charges"("tenant_id", "status", "due_date");
CREATE INDEX "charges_unit_id_due_date_idx" ON "charges"("unit_id", "due_date");
CREATE INDEX "charges_tenancy_id_period_start_idx" ON "charges"("tenancy_id", "period_start");
CREATE INDEX "charges_type_idx" ON "charges"("type");
CREATE INDEX "payments_charge_id_status_idx" ON "payments"("charge_id", "status");
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");
CREATE INDEX "financial_attachments_charge_id_idx" ON "financial_attachments"("charge_id");
CREATE INDEX "financial_attachments_payment_id_idx" ON "financial_attachments"("payment_id");

ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "charges" ADD CONSTRAINT "charges_tenancy_id_fkey"
  FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "charges" ADD CONSTRAINT "charges_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "charges" ADD CONSTRAINT "charges_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "charges" ADD CONSTRAINT "charges_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_charge_id_fkey"
  FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_submitted_by_fkey"
  FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_reviewed_by_fkey"
  FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_charge_id_fkey"
  FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_uploaded_by_fkey"
  FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve apartments that were assigned before tenancy history existed. Their
-- rent starts at zero so an admin can enter the actual terms without creating a
-- false amount due.
INSERT INTO "tenancies" (
  "id", "unit_id", "tenant_id", "start_date", "monthly_rent", "rent_due_day",
  "security_deposit", "notes", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), "id", "tenant_id", CURRENT_DATE, 0, 5, 0,
  'Imported from the original apartment assignment', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "units"
WHERE "tenant_id" IS NOT NULL;

-- Replace only the original Pakistan demo locations. Property names and any
-- user-created records remain untouched.
UPDATE "properties"
SET "address" = 'Al Khuwair 33', "governorate" = 'Muscat', "wilayat" = 'Bawshar',
    "area" = 'Al Khuwair', "way_number" = '3521', "building_number" = '214', "postal_code" = '133'
WHERE "name" = 'Gulberg Plaza' AND "wilayat" = 'Lahore';

UPDATE "properties"
SET "address" = 'Qurum 16', "governorate" = 'Muscat', "wilayat" = 'Bawshar',
    "area" = 'Qurum', "way_number" = '1622', "building_number" = '88', "postal_code" = '112'
WHERE "name" = 'Sunrise Plaza' AND "wilayat" = 'Lahore';

UPDATE "properties"
SET "address" = 'Al Ghubrah North', "governorate" = 'Muscat', "wilayat" = 'Bawshar',
    "area" = 'Al Ghubrah', "way_number" = '3709', "building_number" = '126', "postal_code" = '130'
WHERE "name" = 'Emerald Heights' AND "wilayat" = 'Karachi';

UPDATE "properties"
SET "address" = 'Al Mouj', "governorate" = 'Muscat', "wilayat" = 'Seeb',
    "area" = 'Al Mouj', "way_number" = '2501', "building_number" = '42', "postal_code" = '138'
WHERE "name" = 'Riverview Plaza' AND "wilayat" = 'Islamabad';

UPDATE "users" SET "phone" = '+968 9500 0001'
WHERE "email" = 'plumber@example.com' AND "phone" LIKE '0300-%';
UPDATE "users" SET "phone" = '+968 9500 0002'
WHERE "email" = 'electrician@example.com' AND "phone" LIKE '0300-%';
UPDATE "users" SET "phone" = '+968 9500 0003'
WHERE "email" = 'handyman@example.com' AND "phone" LIKE '0300-%';
