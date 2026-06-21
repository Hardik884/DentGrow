import type { Metadata } from "next";
import { SignupForm } from "./SignupForm";
import { DentGrowLogo } from "@/components/shared/DentGrowLogo";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create a DentGrow patient portal account.",
};

export default function SignupPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-1.5">
        <div className="mb-6">
          <DentGrowLogo size={32} withWordmark />
        </div>
        <h1 className="text-2xl font-semibold text-[#09090B] tracking-tight">Create an account</h1>
        <p className="text-sm text-[#71717A]">Access your patient portal</p>
      </div>

      <div className="bg-white border border-[#E4E4E7] rounded-xl p-6 shadow-sm">
        <SignupForm />
      </div>

      <p className="text-center text-xs text-[#71717A]">
        Already have an account?{" "}
        <a href="/login" className="text-[#09090B] font-medium hover:underline underline-offset-4">
          Sign in
        </a>
      </p>
    </div>
  );
}

