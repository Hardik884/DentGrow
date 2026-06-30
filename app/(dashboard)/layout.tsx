import { redirect } from "next/navigation";
import { resolveSession } from "@/lib/auth/session";
import { DashboardSidebar } from "@/components/layouts/DashboardSidebar";

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

  return (
    <div className="flex h-screen overflow-hidden bg-[#FAFAFA]">
      <DashboardSidebar role={profile.role} fullName={profile.full_name ?? ""} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

