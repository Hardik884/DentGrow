import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Dentist layout — dentist-only section.
 * Asserts role === 'dentist'. Renders 403 if not.
 * Provides the AI Insights side panel slot in the page shell.
 */
export default async function DentistLayout({
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
  if (!profile || profile.role !== "dentist") {
    redirect("/login");
  }

  return <>{children}</>;
}
