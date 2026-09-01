import {
  ArrowRight,
  Banknote,
  Building2,
  ClipboardList,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <>
      <section className="surface-gradient">
        <div className="mx-auto max-w-4xl px-4 py-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            Built for property portfolios in Oman
          </span>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
            Rent, bills and maintenance—sorted.
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Manage Oman tenancy records, OMR rent and charge receipts, then
            assign maintenance to the right person—all against the correct
            building and apartment.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/sign-in" size="lg">
              Sign in
              <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-20">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Feature
            icon={<Banknote className="h-5 w-5" />}
            title="OMR rent & bills"
            description="Track rent, additional charges, partial payments and verified receipts without a payment gateway."
          />
          <Feature
            icon={<ClipboardList className="h-5 w-5" />}
            title="Issue reporting"
            description="Tenants raise an issue against their own apartment, with photos. No more guessing which flat is leaking."
          />
          <Feature
            icon={<Wrench className="h-5 w-5" />}
            title="Task assignment"
            description="Assign work to a maintenance worker and follow it from en route, to in progress, to done."
          />
          <Feature
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Role-based access"
            description="Tenants, workers and administrators each see exactly what they should — and nothing more."
          />
        </div>
      </section>
    </>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          {icon}
        </span>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
