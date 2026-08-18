import { redirect } from "next/navigation";
import { resolveSession } from "@/lib/auth/session";
import { checkReceptionistPaymentAccess } from "@/actions/clinic-settings";
import { DashboardSidebar } from "@/components/layouts/DashboardSidebar";
import { isBusinessBrainEnabled } from "@/lib/feature-flags";

// Every dashboard route is authenticated and reads request cookies, so it is
// inherently per-request dynamic. Declaring it here prevents Next from
// attempting (and failing) static prerendering during the build, which
// otherwise logs DYNAMIC_SERVER_USAGE errors via the data-layer catch blocks.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Request-scoped cached resolver: this single auth.getUser() + profile lookup
  // is shared (memoised) with every Server Action and Server Component rendered
  // for this request, so the dashboard no longer pays for redundant auth/profile
  // round-trips on each page load.
  const { user, profile } = await resolveSession();

  if (!user) {
    redirect("/login");
  }

  if (!profile) {
    redirect("/login");
  }

  // Check receptionist payment access for sidebar display
  const allowReceptionistPayments = profile.role === "receptionist" 
    ? await checkReceptionistPaymentAccess()
    : false;

  // Business Brain is a development surface, allow-listed per clinic. Resolved
  // here so the nav entry never renders for a clinic that cannot open the page.
  const showBusinessBrain =
    profile.role === "dentist" && isBusinessBrainEnabled(profile.clinic_id);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <DashboardSidebar 
        role={profile.role} 
        fullName={profile.full_name ?? ""} 
        allowReceptionistPayments={allowReceptionistPayments}
        showBusinessBrain={showBusinessBrain}
      />
      {/* pt-14 clears the fixed mobile top bar rendered by DashboardSidebar
          below md; the desktop sidebar sits in normal flow so no offset is
          needed at md and up. min-w-0 stops flex children (tables, charts)
          from forcing the column wider than the viewport. */}
      <main className="flex-1 min-w-0 overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}

