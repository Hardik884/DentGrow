import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata = {
  title: "Account Not Linked",
  description: "This account is not yet linked to a patient record.",
};

/**
 * /portal/setup — the dead end for an account with no patient record.
 *
 * WHAT THIS USED TO BE
 *   Self-service linking. It asked for a phone number, searched the chosen
 *   clinic for a matching patient, and — if it found none — CREATED a new
 *   patient record from whatever name was typed in. It also carried a clinic
 *   dropdown for anyone who arrived without the signup cookie.
 *
 * WHY NONE OF THAT SURVIVES
 *   Both halves are incompatible with how portal access now works:
 *
 *     - The clinic picker was the last place in the product where a visitor
 *       could assert which tenant they belong to. Eligibility is now decided by
 *       an address the CLINIC put on a record, and the clinic is read from that
 *       record (actions/portal-activation.ts).
 *     - Creating a patient record from the portal is exactly the "global
 *       registration where someone can choose any clinic" this release removes.
 *       It also produced the duplicate records the clinic then had to merge:
 *       the person already existed, matched on a phone number that is not
 *       unique even within one clinic
 *       (20260822000000_drop_patient_phone_uniqueness.sql).
 *
 * WHY THE ROUTE STILL EXISTS
 *   Middleware sends any authenticated non-staff user with no portal link here
 *   (lib/supabase/middleware.ts), and that redirect is load-bearing — without a
 *   destination those users would loop. Reaching it should now be rare: an
 *   activation that completes creates the link in the same action that sets the
 *   password, and one that does not complete leaves an account with no password
 *   to sign in with.
 *
 *   So this explains the situation and stops, rather than offering a way to
 *   self-serve around it. "Contact your clinic" is the correct answer here: only
 *   the clinic can put an address on the right record, and that is precisely the
 *   decision that must not be delegated to the person asking.
 */
export default async function PortalSetupPage() {
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/patient/login");

  const { data: existingLink } = await db
    .from("patient_portal_links")
    .select("patient_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Already linked — nothing to explain.
  if (existingLink) redirect("/portal");

  return (
    <AuthShell
      tone="patient"
      eyebrow="Patient portal"
      headline="We couldn't match your account."
      subhead="Your sign-in works, but it isn't connected to a patient record yet."
      formTitle="Almost there"
      formSubtitle="Your clinic needs to finish this step."
      footer={
        <a
          href="/patient/login"
          className="rounded font-medium text-accent underline-offset-4 transition-colors duration-150 hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Back to sign in
        </a>
      }
    >
      <div className="space-y-4 text-[13px] leading-relaxed text-text-secondary">
        <p>
          Portal access is set up by your clinic. Ask them to add your email
          address to your patient record, then activate your account again.
        </p>
        <p>
          {/* The address is shown because it is the exact string the clinic has
              to put on the record for activation to match. Anything else sends
              them looking for a typo they cannot see. */}
          The address on this account is{" "}
          <span className="font-medium text-text-primary">{user.email}</span>.
        </p>
        <a
          href="/patient/signup"
          className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-accent px-6 text-sm font-semibold text-white transition-colors duration-150 hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Try activating again
        </a>
      </div>
    </AuthShell>
  );
}
