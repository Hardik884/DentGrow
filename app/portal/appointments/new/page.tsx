import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { SlotPicker } from "@/components/patient/SlotPicker";

export const metadata: Metadata = {
  title: "Book Appointment",
};

/**
 * /portal/appointments/new
 *
 * Server Component — resolves the patient's patientId from the portal link,
 * then renders SlotPicker with the patientId pre-set.
 *
 * Flow:
 * 1. Fetch portal link to get patient_id.
 * 2. SlotPicker fetches available slots via getAvailableSlots(date).
 * 3. Patient selects a slot and confirms → createAppointment() server action.
 * 4. Redirect to /portal/appointments on success.
 */
export default async function PortalNewAppointmentPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Resolve patient_id from portal link
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;
  const { data: link } = await db
    .from("patient_portal_links")
    .select("patient_id")
    .eq("user_id", user.id)
    .single();

  if (!link) redirect("/portal/setup");

  const patientId = (link as { patient_id: string }).patient_id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Book an Appointment</h1>
        <p className="text-gray-600 text-sm mt-1">
          Select an available date and time slot.
        </p>
      </div>

      <SlotPicker patientId={patientId} />
    </div>
  );
}

