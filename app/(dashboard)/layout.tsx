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
    <div className="flex h-screen overflow-hidden bg-[#F6F8F6]">
      <DashboardSidebar 
        role={profile.role} 
        fullName={profile.full_name ?? ""} 
        allowReceptionistPayments={allowReceptionistPayments}
        showBusinessBrain={showBusinessBrain}
      />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

