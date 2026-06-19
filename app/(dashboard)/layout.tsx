import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/layouts/DashboardSidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, clinic_id, role, full_name")
    .eq("id", user.id)
    .single();

  const profile = profileData as {
    id: string;
    clinic_id: string;
    role: "dentist" | "receptionist" | "patient";
    full_name: string;
  } | null;

  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#FAFAFA]">
      <DashboardSidebar role={profile.role} fullName={profile.full_name} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

