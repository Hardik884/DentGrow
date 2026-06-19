import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign In — DentGrow",
  description: "Sign in to your DentGrow account.",
};

/**
 * /login
 *
 * Staff (dentist + receptionist) and patient portal sign-in page.
 * After successful auth the signIn Server Action resolves the user's role
 * and redirects to the correct dashboard:
 *   dentist      → /dentist
 *   receptionist → /receptionist
 *   patient      → /portal
 *
 * Already-authenticated users are bounced away by middleware before
 * this page renders.
 */
export default function LoginPage() {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-8 space-y-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">DentGrow</h1>
        <p className="text-sm text-gray-500">Sign in to your account</p>
      </div>

      <LoginForm />

      <p className="text-center text-sm text-gray-500">
        New patient?{" "}
        <a href="/signup" className="text-blue-600 hover:underline font-medium">
          Create an account
        </a>
      </p>
    </div>
  );
}
