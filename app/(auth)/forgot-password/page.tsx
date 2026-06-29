import type { Metadata } from "next";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { DentGrowLogo } from "@/components/shared/DentGrowLogo";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Request a password reset link for your DentGrow patient account.",
};

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-8">
      {/* Brand */}
      <div className="space-y-1.5">
        <div className="mb-6">
          <DentGrowLogo size={32} withWordmark />
        </div>
        <h1 className="text-2xl font-semibold text-[#09090B] tracking-tight">Reset your password</h1>
        <p className="text-sm text-[#71717A]">
          Enter your email and we&apos;ll send you a link to reset it.
        </p>
      </div>

      {/* Card */}
      <div className="bg-white border border-[#E4E4E7] rounded-xl p-6 shadow-sm">
        <ForgotPasswordForm />
      </div>

      <p className="text-center text-xs text-[#71717A]">
        Remember your password?{" "}
        <a href="/login" className="text-[#09090B] font-medium hover:underline underline-offset-4">
          Back to sign in
        </a>
      </p>
    </div>
  );
}
