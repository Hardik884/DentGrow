import type { Metadata } from "next";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: "Create Account — DentGrow",
  description: "Create a DentGrow patient portal account.",
};

/**
 * /signup
 *
 * Patient portal account self-registration page.
 * Staff accounts are provisioned by the clinic administrator out-of-band.
 *
 * After signup, the signUp Server Action redirects to /portal/setup
 * where the patient's auth account is matched to their existing patient
 * record by phone number.
 *
 * Already-authenticated users are bounced away by middleware.
 */
export default function SignupPage() {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-8 space-y-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">DentGrow</h1>
        <p className="text-sm text-gray-500">Create your patient portal account</p>
      </div>

      <SignupForm />

      <p className="text-center text-sm text-gray-500">
        Already have an account?{" "}
        <a href="/login" className="text-blue-600 hover:underline font-medium">
          Sign in
        </a>
      </p>
    </div>
  );
}
