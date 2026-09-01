# Property Management System

A property management application built with Next.js, Supabase (Postgres, Auth and Storage) and
Prisma — covering tenant lifecycle, rent and charge ledgers, receipt verification, maintenance
requests, worker task assignment and admin oversight. Payments are recorded manually; there is no
payment gateway.

The product is localized for the Sultanate of Oman: OMR amounts use three decimal places,
properties store Governorate/Wilayat/Area/Way/Building details, and tenancy records include Civil
ID context, municipality registration documents and lease purpose. Private document storage covers
personal identity records, tenancy agreements and property ownership/approval documents.

## Stack

| Concern      | Technology                                              |
| ------------ | -------------------------------------------------------- |
| Framework    | Next.js 16 (App Router, Server Actions)                 |
| Database     | Supabase Postgres via Prisma 7 (`@prisma/adapter-pg`)   |
| Auth         | Supabase Auth (credentials, session via cookies)        |
| File storage | Supabase Storage                                         |
| UI           | Tailwind CSS + shadcn/ui                                 |

## The model

The portfolio is **buildings → apartments → tenants**:

```
Property (building; Oman address + title/plot details)
   └── Unit (apartment)
          └── tenant (one User, optional)

MaintenanceRequest → Unit   (which apartment, in which building)
                   → location ("Kitchen" — the room inside it)

Unit → Tenancy              (who lived there, when, rent, due day and deposit)
     → Charge → Payment     (rent/bill due → manual payment/proof → admin review)
```

Every request is tied to a real apartment, so a worker always knows exactly where to go.

## Roles

- **user** (tenant) — lives in one apartment; reports issues, sees rent/bills, uploads receipts and
  manages private personal and tenancy documents.
- **worker** — sees assigned tasks with the full address, moves them
  `en_route → in_progress → completed`, uploads proof photos, and can put blocked work on hold
  with a required reason.
- **admin** — manages buildings, apartments, people and tenancy terms; generates monthly rent, adds
  other charges, records cash/transfers, reviews tenant proofs, assigns workers and sees everything.
  Held maintenance jobs return to the admin queue for reassignment and rescheduling.

An admin can create accounts directly (**People → Add a person**), and public sign-up stays
open. Self-signups arrive as tenants with no apartment until an admin assigns one — until then
they cannot file a request.

### Maintenance hold workflow

1. A worker or admin can move any active maintenance job to **On Hold** with a required reason.
   The job leaves the worker's active queue, while the existing worker remains saved as the default
   choice.
2. The tenant sees the reason and can tell the admin when their dependency is resolved. That signal
   does not restart the job by itself; vendor- or management-side holds can also be resumed without
   a tenant signal.
3. An admin chooses the worker and resumes the job. Keeping the same worker restores the stage from
   before the hold. Choosing a different worker restarts at **Pending**, so the new worker follows
   the normal `En Route → In Progress` flow.
4. Every hold and resume is recorded in the request activity history, and the relevant tenant,
   admins, and worker receive notifications.

## Getting started

1. Create a project at [supabase.com](https://supabase.com) (free tier is enough to start).
2. Copy `.env.example` to `.env` and fill it in from the project's **Settings → API** and
   **Settings → Database** pages — see [Environment](#environment) below.
3. Run:

```bash
npm install
npm run db:migrate        # create the tables (and the users FK into Supabase Auth)
npm run db:seed           # create the first admin, plus demo data
npm run dev
```

### Environment

See `.env.example`, all values come from the Supabase dashboard:

- **`NEXT_PUBLIC_SUPABASE_URL`**, **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** — Settings → API.
- **`SUPABASE_SERVICE_ROLE_KEY`** — Settings → API. Server-only: it bypasses every access
  rule, so it must never end up in a `NEXT_PUBLIC_` variable or reach the browser.
- **`DATABASE_URL`** — Settings → Database → Connection string → **Transaction pooler**
  (port 6543). What Prisma uses for normal queries.
- **`DIRECT_URL`** — the same page's **Direct connection** (port 5432). Used for migrations,
  and by `lib/realtime.ts`'s `LISTEN/NOTIFY` connection, which needs a session the pooler
  can't hold open.
- **`SUPABASE_STORAGE_BUCKET`** — any name; created automatically on first use.

### Seeding the first admin

`npm run db:seed` creates a Supabase Auth account (if one doesn't already exist for that
email) plus the matching admin profile row. Override the defaults:

```bash
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='a-strong-password' npm run db:seed
```

## Storage

Attachments go to the Supabase Storage bucket in `SUPABASE_STORAGE_BUCKET`, keyed as
`attachments/<requestId>/<uuid>.<ext>`. The bucket is **private**: nothing is served
directly from it. Every download goes through `GET /api/attachment/[id]`, which allows
the request's owner, any admin, or the worker assigned to that request — and 403s
everyone else.

An admin can create the bucket from **/protected/admin/storage-setup**, or it is created
lazily on the first upload.

Maintenance evidence accepts PNG / JPEG / GIF / WebP; financial documents also accept PDF. Every
bill and receipt is served through its own authenticated route, and is visible only to the affected
tenant and administrators.

### Upload size

Every upload travels inside a Server Action request body, and that body has a hard ceiling:
Next's `serverActions.bodySizeLimit` (set to `4.5mb` in `next.config.ts`) and, on Vercel,
the platform's own 4.5MB request limit. Anything over it is rejected **before** the action
runs, so the action cannot redirect back with an explanation — the user gets a blank
"server error" page instead, which is how oversized payment receipts used to fail.

So the real limit lives in [`lib/upload-limits.ts`](lib/upload-limits.ts): **4MB per file, and
4MB per submission** across every file field in one form. Both the browser and the server read
it from there, which keeps the message a user sees ("… is 6.2MB. Maximum is 4MB per file.")
identical to the rule the server enforces.

When adding a form that uploads:

- use `UploadFileInput` from `components/upload-file-input.tsx` rather than a raw
  `<input type="file">` — it validates size and type before anything is posted;
- wrap a form that has **more than one** file field in `UploadBudgetProvider`, so the fields
  share one request budget instead of each passing its own check and busting the total;
- put `encType="multipart/form-data"` on the `<form>`, so a submit that happens before
  hydration still carries the file rather than just its name;
- keep the upload out of the transaction and treat its failure as a warning on a saved
  record, the way `createChargeAction` and `startTenancyAction` do — losing an attachment
  should not lose the payment or the tenancy.

Raising the cap means moving the upload out of the Server Action body entirely — a presigned
`PUT` straight to MinIO, which also needs CORS on the bucket. Nothing here can lift it alone.

Property, tenancy and personal documents are also stored privately as PDFs or images. Property
documents are admin-only; a tenant can access documents for their own tenancy and personal record.

## Rent and bills workflow

1. An admin starts a tenancy with move-in/lease dates, monthly rent, due day and security deposit.
   Signed agreements, municipality registration and handover documents can be attached directly.
2. The admin generates rent for a month in one batch; rerunning the same month is idempotent.
3. Admins can add other charges and attach the original bill.
4. Tenants submit a full or partial payment with a receipt/screenshot. It remains under review and
   does not reduce the confirmed balance yet.
5. An admin approves or rejects the proof. Approved amounts reduce the balance; the charge closes
   when fully covered. Admin-recorded cash or transfers are approved immediately.
6. Move-out ends the current tenancy pointer but preserves all tenancy, charge and payment history.

Amounts are stored and displayed in Omani Rial (OMR) with three decimal places. Manual payment
records support cash, bank transfer, OmanNet/card receipt, mobile payment, direct debit and cheque.

## Scripts

| Script               | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `npm run dev`        | Development server                         |
| `npm run build`      | `prisma generate` + production build       |
| `npm run typecheck`  | TypeScript, no emit                        |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:seed`    | Create/promote the admin user              |
| `npm run db:studio`  | Browse the database                        |

### A note on migrations

The database user does not have permission to `CREATE DATABASE`, so `prisma migrate dev`
cannot build its shadow database. Generate migration SQL directly instead, then apply it:

```bash
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
  --to-schema prisma/schema.prisma --script > prisma/migrations/<timestamp>_<name>/migration.sql
npm run db:migrate
```
