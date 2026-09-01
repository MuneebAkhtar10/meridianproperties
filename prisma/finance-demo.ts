import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, TenancyPurpose } from "../lib/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const shouldApply = process.argv.includes("--apply");

async function getSnapshot() {
  return prisma.tenancy.findMany({
    where: { endDate: null },
    orderBy: [
      { unit: { property: { name: "asc" } } },
      { unit: { label: "asc" } },
    ],
    include: {
      tenant: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          civilId: true,
          phone: true,
          nationality: true,
          employer: true,
          emergencyContactName: true,
          emergencyContactPhone: true,
        },
      },
      unit: {
        include: {
          property: { select: { name: true } },
        },
      },
      charges: { select: { id: true, amount: true, status: true } },
    },
  });
}

function printSnapshot(
  label: string,
  tenancies: Awaited<ReturnType<typeof getSnapshot>>,
) {
  console.log(`\n${label}`);
  console.log("=".repeat(label.length));

  let monthlyTotal = 0;
  let chargeCount = 0;

  tenancies.forEach((tenancy, index) => {
    const rent = Number(tenancy.monthlyRent);
    monthlyTotal += rent;
    chargeCount += tenancy.charges.length;
    const tenantName = [tenancy.tenant.firstName, tenancy.tenant.lastName]
      .filter(Boolean)
      .join(" ");

    console.log(
      `${index + 1}. ${tenantName || "Tenant"} <${tenancy.tenant.email}> | ${tenancy.unit.property.name} · Apt ${tenancy.unit.label} | rent OMR ${rent.toFixed(3)} | deposit OMR ${Number(tenancy.securityDeposit).toFixed(3)} | due day ${tenancy.rentDueDay} | charges ${tenancy.charges.length}`,
    );
  });

  console.log(`Monthly portfolio rent: OMR ${monthlyTotal.toFixed(3)}`);
  console.log(`Existing financial charges: ${chargeCount}`);
  console.log(
    `Incomplete zero-rent tenancies: ${tenancies.filter((tenancy) => Number(tenancy.monthlyRent) === 0).length}`,
  );
}

async function main() {
  const before = await getSnapshot();
  printSnapshot("Current finance demo snapshot", before);

  if (!shouldApply) {
    console.log(
      "\nRead-only inspection. Pass --apply to fill zero-rent tenancies.",
    );
    return;
  }

  const incomplete = before.filter(
    (tenancy) => Number(tenancy.monthlyRent) === 0,
  );

  for (const [index, tenancy] of incomplete.entries()) {
    const monthlyRent = 300 + index * 25;
    const suffix = String(index + 1).padStart(3, "0");

    await prisma.$transaction([
      prisma.tenancy.update({
        where: { id: tenancy.id },
        data: {
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          leaseEndDate: new Date("2026-12-31T00:00:00.000Z"),
          monthlyRent: monthlyRent.toFixed(3),
          rentDueDay: 5,
          securityDeposit: monthlyRent.toFixed(3),
          purpose: TenancyPurpose.residential,
          agreementRef: `DEMO-LEASE-${tenancy.unit.label}-2026`,
          municipalityContractNumber: `MM-DEMO-2026-${suffix}`,
          contractRegisteredAt: new Date("2026-01-02T00:00:00.000Z"),
          notes: "Oman demo terms for feature testing and presentation.",
        },
      }),
      prisma.user.update({
        where: { id: tenancy.tenantId },
        data: {
          civilId:
            tenancy.tenant.civilId ??
            `DEMO-CID-${tenancy.tenant.id.slice(0, 8).toUpperCase()}`,
          phone: tenancy.tenant.phone ?? `+968 9200 ${1000 + index}`,
          nationality: tenancy.tenant.nationality ?? "Omani",
          employer: tenancy.tenant.employer ?? "Muscat Demo Services LLC",
          emergencyContactName:
            tenancy.tenant.emergencyContactName ?? `Demo Contact ${index + 1}`,
          emergencyContactPhone:
            tenancy.tenant.emergencyContactPhone ?? `+968 9900 ${1000 + index}`,
        },
      }),
    ]);
  }

  const after = await getSnapshot();
  printSnapshot("Updated finance demo snapshot", after);
  console.log(`Updated ${incomplete.length} imported tenancy record(s).`);
  console.log(
    "No rent charge or payment was created; generate rent from the UI.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
