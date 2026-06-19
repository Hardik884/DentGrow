import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Receptionist layout — receptionist-only section.
 * Asserts role === 'receptionist'. Redirects if not.
 * No analytics nav items. No AI features.
 */
export default async function ReceptionistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const profile = profileData as { role: string } | null;
  if (!profile || profile.role !== "receptionist") {
    redirect("/login");
  }

  return <>{children}</>;
}
