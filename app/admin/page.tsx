import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Brain,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { SignOutButton } from "@/components/shared/SignOutButton";
import { isBusinessBrainEnabled } from "@/lib/feature-flags";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * /admin — the platform admin console.
 *
 * WHAT THIS IS
 *   The landing page behind /admin/login. It is deliberately a small console,
 *   not a second product: it confirms who is signed in, shows the shape of the
 *   environment, and hands the admin back into the surfaces it already had.
 *   Admin was added as a separate DOOR, not as a new set of powers, so this
 *   page grants nothing that the account could not already do.
 *
 * WHY requireAdmin() IS CALLED HERE AND NOT ONLY IN MIDDLEWARE
 *   Middleware is a redirect layer for browsers. This call is the actual gate:
 *   it re-resolves the session server-side on every render and bounces any
 *   non-admin, so typing /admin can never render this page for a dentist,
 *   receptionist or patient (CLAUDE.md §13.10).
 *
 * The counts below are read with the service-role client on purpose — an admin
 * overview is inherently cross-clinic, and RLS scopes the ordinary client to a
 * single clinic. Only aggregate counts are read; no patient row ever reaches
 * this page.
 */
export default async function AdminPage() {
  const profile = await requireAdmin();

  const overview = await loadOverview(profile.clinic_id);

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#14191A] text-white">
              <ShieldCheck className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold tracking-tight text-text-primary">
                OraMedha Admin
              </h1>
              <p className="truncate text-xs text-text-secondary">
                {profile.full_name ?? "Administrator"}
              </p>
            </div>
          </div>

          <SignOutButton className="w-auto" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-5 py-8 sm:px-8 sm:py-10">
        {/* Environment */}
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
            Environment
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Clinics" value={overview.clinics} />
            <Stat label="Staff accounts" value={overview.staff} />
            <Stat label="Patient records" value={overview.patients} />
            <Stat label="Portal accounts" value={overview.portalAccounts} />
          </dl>
        </section>

        {/* Where the admin actually works */}
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
            Your workspace
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-body">
            This account is also the dentist for{" "}
            <span className="font-medium text-text-primary">
              {overview.homeClinicName ?? "its clinic"}
            </span>
            . Everything it could do before is still here — admin is an extra
            door, not a different account.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <AdminLink
              href="/dentist"
              icon={LayoutDashboard}
              title="Clinic dashboard"
              description="Today's schedule, queue and KPIs for your clinic."
            />
            {isBusinessBrainEnabled(profile.clinic_id) && (
              <AdminLink
                href="/dentist/business-brain"
                icon={Brain}
                title="Business Brain"
                description="The development analysis surface for this clinic."
              />
            )}
            <AdminLink
              href="/dentist/settings"
              icon={Settings2}
              title="Clinic settings"
              description="Hours, chairs, availability and consent templates."
            />
            <AdminLink
              href="/dentist/analytics"
              icon={Activity}
              title="Analytics"
              description="Appointments, revenue, patients and follow-ups."
            />
          </div>
        </section>

        <p className="text-xs leading-relaxed text-text-secondary">
          Admin access is granted by the <code className="font-mono">is_admin</code>{" "}
          flag on a profile and can only be changed server-side. Clinic data
          remains scoped by row-level security exactly as it is for every other
          account — this page does not bypass it.
        </p>
      </main>
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-text-primary">
        {value ?? "—"}
      </dd>
    </div>
  );
}

function AdminLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof LayoutDashboard;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-border bg-surface p-4 transition-colors duration-150 hover:border-border-strong hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
          {title}
          <ArrowUpRight
            className="h-3.5 w-3.5 text-text-secondary transition-colors duration-150 group-hover:text-accent"
            aria-hidden="true"
          />
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-text-secondary">
          {description}
        </span>
      </span>
    </Link>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────

type Overview = {
  clinics: number | null;
  staff: number | null;
  patients: number | null;
  portalAccounts: number | null;
  homeClinicName: string | null;
};

/**
 * Aggregate counts for the environment panel.
 *
 * Every failure is swallowed into a null so the console still renders: an admin
 * locked out of its own overview because one count errored would be a worse
 * outcome than a dash on a card.
 */
async function loadOverview(homeClinicId: string): Promise<Overview> {
  const empty: Overview = {
    clinics: null,
    staff: null,
    patients: null,
    portalAccounts: null,
    homeClinicName: null,
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = createAdminClient();

    const count = async (table: string, apply?: (q: unknown) => unknown) => {
      let query = admin.from(table).select("*", { count: "exact", head: true });
      if (apply) query = apply(query);
      const { count: n, error } = await query;
      return error ? null : (n as number);
    };

    const [clinics, staff, patients, portalAccounts, home] = await Promise.all([
      count("clinics"),
      count("profiles", (q) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q as any).in("role", ["dentist", "receptionist"])
      ),
      count("patients", (q) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q as any).is("deleted_at", null)
      ),
      count("patient_portal_links"),
      (async () => {
        const { data } = await admin
          .from("clinics")
          .select("name")
          .eq("id", homeClinicId)
          .maybeSingle();
        return (data as { name: string } | null)?.name ?? null;
      })(),
    ]);

    return {
      clinics,
      staff,
      patients,
      portalAccounts,
      homeClinicName: home,
    };
  } catch (err) {
    console.error("[admin] overview failed:", err);
    return empty;
  }
}
