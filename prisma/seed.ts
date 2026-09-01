import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserType } from "../lib/generated/prisma/client";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * Service-role Supabase client, built inline here (rather than importing
 * lib/supabase/admin.ts) because that file starts with `import "server-only"`,
 * which only works when bundled by Next.js — running it directly under tsx
 * (as this seed script does) makes it throw unconditionally.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    // Node 20 has no native WebSocket global (that lands in Node 22), and
    // supabase-js's realtime client requires one at construction time even
    // though this seed script never actually opens a realtime channel.
    realtime: { transport: ws as unknown as never },
  },
);

/** Oman demo buildings. Existing names stay stable so reseeding is idempotent. */
const BUILDINGS = [
  {
    name: "Gulberg Plaza",
    address: "Al Khuwair 33",
    governorate: "Muscat",
    wilayat: "Bawshar",
    area: "Al Khuwair",
    wayNumber: "3521",
    buildingNumber: "214",
    postalCode: "133",
  },
  {
    name: "Sunrise Plaza",
    address: "Qurum 16",
    governorate: "Muscat",
    wilayat: "Bawshar",
    area: "Qurum",
    wayNumber: "1622",
    buildingNumber: "88",
    postalCode: "112",
  },
  {
    name: "Emerald Heights",
    address: "Al Ghubrah North",
    governorate: "Muscat",
    wilayat: "Bawshar",
    area: "Al Ghubrah",
    wayNumber: "3709",
    buildingNumber: "126",
    postalCode: "130",
  },
  {
    name: "Riverview Plaza",
    address: "Al Mouj",
    governorate: "Muscat",
    wilayat: "Seeb",
    area: "Al Mouj",
    wayNumber: "2501",
    buildingNumber: "42",
    postalCode: "138",
  },
];

const FLOORS = 10;
const PER_FLOOR = 5;

/**
 * Creates (or reuses) the Supabase Auth account for `email`/`password`, then
 * upserts the matching profile row with the same id. Auth is the source of
 * truth for "does this account exist", so we look there first.
 */
async function upsertPerson(
  email: string,
  password: string,
  profile: Omit<
    Parameters<typeof prisma.user.upsert>[0]["create"],
    "id" | "email"
  >,
) {
  const { data: existingPage, error: listError } =
    await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) {
    throw listError;
  }

  let authUserId = existingPage.users.find((u) => u.email === email)?.id;

  if (!authUserId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw error ?? new Error(`Could not create auth user for ${email}`);
    }
    authUserId = data.user.id;
  }

  return prisma.user.upsert({
    where: { id: authUserId },
    update: profile,
    create: { id: authUserId, email, ...profile },
  });
}

async function main() {
  const password = process.env.SEED_PASSWORD ?? "password123";

  // ── Admin ────────────────────────────────────────────────────────────────
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com")
    .trim()
    .toLowerCase();

  const admin = await upsertPerson(
    adminEmail,
    process.env.SEED_ADMIN_PASSWORD ?? "admin123",
    { userType: UserType.admin, firstName: "Site", lastName: "Admin" },
  );

  console.log(`✅ admin: ${admin.email}`);

  // ── Property types ───────────────────────────────────────────────────────
  const apartmentType = await prisma.propertyType.upsert({
    where: { name: "apartment" },
    update: {},
    create: {
      name: "apartment",
      label: "Apartment building",
      unitNounSingular: "Apartment",
      unitNounPlural: "Apartments",
      unitPrefix: "Apt",
      hasFloors: true,
      hasBedrooms: true,
      locationOptions: [
        "Kitchen",
        "Bathroom",
        "Bedroom",
        "Living room",
        "Balcony",
        "Hallway",
        "Whole apartment",
        "Other",
      ],
    },
  });

  await prisma.propertyType.upsert({
    where: { name: "villa" },
    update: {},
    create: {
      name: "villa",
      label: "Villa",
      unitNounSingular: "Villa",
      unitNounPlural: "Villas",
      unitPrefix: null,
      hasFloors: false,
      hasBedrooms: true,
      locationOptions: [
        "Living room",
        "Bedroom",
        "Bathroom",
        "Kitchen",
        "Garden / yard",
        "Garage",
        "Whole villa",
        "Other",
      ],
    },
  });

  // ── Buildings + apartments ───────────────────────────────────────────────
  for (const building of BUILDINGS) {
    const property = await prisma.property.upsert({
      where: {
        id:
          (await findPropertyId(building.name)) ??
          "00000000-0000-0000-0000-000000000000",
      },
      update: { ...building, propertyTypeId: apartmentType.id },
      create: { ...building, propertyTypeId: apartmentType.id },
    });

    const units = [];

    for (let floor = 1; floor <= FLOORS; floor++) {
      for (let n = 1; n <= PER_FLOOR; n++) {
        units.push({
          propertyId: property.id,
          label: `${floor}${String(n).padStart(2, "0")}`,
          floor,
          bedrooms: (n % 3) + 1,
        });
      }
    }

    const { count } = await prisma.unit.createMany({
      data: units,
      skipDuplicates: true,
    });

    console.log(
      `🏢 ${property.name}: ${count} apartment(s) added (${FLOORS * PER_FLOOR} total)`,
    );
  }

  // ── Workers ──────────────────────────────────────────────────────────────
  for (const [index, name] of [
    "plumber",
    "electrician",
    "handyman",
  ].entries()) {
    const email = `${name}@example.com`;
    const phone = `+968 9500 00${String(index + 1).padStart(2, "0")}`;
    await upsertPerson(email, password, {
      userType: UserType.worker,
      firstName: name[0].toUpperCase() + name.slice(1),
      lastName: "Staff",
      phone,
    });
  }

  console.log("🔧 workers: plumber@ / electrician@ / handyman@example.com");

  // ── Tenants, each moved into a real apartment ────────────────────────────
  const firstBuilding = await prisma.property.findFirst({
    where: { name: BUILDINGS[0].name },
    include: { units: { orderBy: { label: "asc" }, take: 3 } },
  });

  if (firstBuilding) {
    const tenantNames = ["Ahmed", "Salim", "Fatma"];

    for (const [index, unit] of firstBuilding.units.entries()) {
      const email = `tenant${index + 1}@example.com`;
      const phone = `+968 9200 00${String(index + 1).padStart(2, "0")}`;

      const tenant = await upsertPerson(email, password, {
        userType: UserType.user,
        firstName: tenantNames[index],
        lastName: "Al Habsi",
        phone,
        nationality: "Omani",
      });

      await prisma.unit.update({
        where: { id: unit.id },
        data: { tenantId: tenant.id },
      });

      const activeTenancy = await prisma.tenancy.findFirst({
        where: { tenantId: tenant.id, unitId: unit.id, endDate: null },
      });

      if (!activeTenancy) {
        const monthlyRent = 325 + index * 25;
        await prisma.tenancy.create({
          data: {
            tenantId: tenant.id,
            unitId: unit.id,
            startDate: new Date("2026-01-01T00:00:00.000Z"),
            monthlyRent: monthlyRent.toFixed(3),
            securityDeposit: monthlyRent.toFixed(3),
            rentDueDay: 1,
            notes: "Oman demo tenancy",
          },
        });
      }

      console.log(`🏠 ${email} → ${firstBuilding.name} Apt ${unit.label}`);
    }
  }

  const totals = {
    properties: await prisma.property.count(),
    units: await prisma.unit.count(),
    users: await prisma.user.count(),
  };

  console.log(
    `\n📊 ${totals.properties} properties · ${totals.units} apartments · ${totals.users} users`,
  );
  console.log(
    `🔑 admin password: ${process.env.SEED_ADMIN_PASSWORD ?? "admin123"}`,
  );
  console.log(`🔑 everyone else:  ${password}`);
}

/** Properties have no natural key, so look one up by name to keep the seed idempotent. */
async function findPropertyId(name: string): Promise<string | null> {
  const existing = await prisma.property.findFirst({
    where: { name },
    select: { id: true },
  });
  return existing?.id ?? null;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
