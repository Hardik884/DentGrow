import type { Metadata } from "next";
import { AdminLoginForm } from "./AdminLoginForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  title: "OraMedha Admin",
  // Not advertised, and not indexed either. This is belt-and-braces on top of
  // the real control: authorisation is checked server-side on every request.
  robots: { index: false, follow: false },
};

/**
 * /admin/login — the platform admin entry point.
 *
 * Reachable only by typing the URL: nothing in the product links here, and the
 * staff and patient pages do not mention that it exists. That is a
 * discoverability decision, NOT the security boundary. Anyone can open this
 * page; what stops them going further is signInAdmin, which verifies
 * profiles.is_admin server-side after the password check and signs a non-admin
 * straight back out, and requireAdmin() on every page behind it.
 *
 * The tone is deliberately flat — graphite instead of emerald, no product
 * pitch, no reassurance copy. This is a maintenance door, and it should look
 * like one.
 */
export default function AdminLoginPage() {
  return (
    <AuthShell
      tone="admin"
      eyebrow="Restricted"
      headline="OraMedha Admin"
      subhead="Authorized access only. All sign-in attempts are checked against the platform administrator record."
      formTitle="Administrator sign-in"
      formSubtitle="This entry point is for the OraMedha platform administrator."
      footer={
        <span className="text-text-body">
          Clinic staff and patients sign in from their own pages.
        </span>
      }
    >
      <AdminLoginForm />
    </AuthShell>
  );
}
