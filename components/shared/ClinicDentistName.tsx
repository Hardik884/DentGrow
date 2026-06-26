import { createServerClient } from "@/lib/supabase/server";
import { Stethoscope } from "lucide-react";

/**
 * ClinicDentistName
 *
 * Renders the current clinic's dentist display name on the dentist and
 * receptionist dashboards. The name is read from the clinics table
 * (clinics.dentist_name) for the authenticated user's clinic — never
 * hardcoded — so it is fully data-driven:
 *   - "Dr. Liying's Dental Care" → "Dr. Liying"
 *   - "Clinic B"                 → empty (no name seeded yet)
 *
 * When the clinic has no dentist_name, the section renders nothing (kept
 * empty for now), as required.
 *
 * Clinic scoping: the read is scoped to the user's profile.clinic_id and is
 * additionally protected by the clinics RLS policy (id = auth_clinic_id()).
 */
export async function ClinicDentistName() {
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await db
    .from("profiles")
    .select("clinic_id")
    .eq("id", user.id)
    .single();

  const clinicId = (profile as { clinic_id: string } | null)?.clinic_id;
  if (!clinicId) return null;

  const { data: clinic } = await db
    .from("clinics")
    .select("dentist_name")
    .eq("id", clinicId)
    .maybeSingle();

  const dentistName = (clinic as { dentist_name: string | null } | null)?.dentist_name?.trim();

  // Clinic B (and any clinic without a named dentist) → keep empty for now.
  if (!dentistName) return null;

  return (
    <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-[#E4E4E7] bg-white px-3 py-2">
      <Stethoscope className="h-4 w-4 text-[#A1A1AA]" aria-hidden />
      <span className="text-xs text-[#71717A]">Dentist</span>
      <span className="text-sm font-medium text-[#09090B]">{dentistName}</span>
    </div>
  );
}
