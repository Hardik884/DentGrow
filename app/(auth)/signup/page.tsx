import type { Metadata } from "next";
import { SignupForm } from "./SignupForm";
import { DentGrowLogo } from "@/components/shared/DentGrowLogo";
import { getClinics } from "@/actions/clinics";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create a DentGrow patient portal account.",
};

export default async function SignupPage() {
  const { data: clinics } = await getClinics();

  return (
    <div className="space-y-8">
      <div className="space-y-1.5">
        <div className="mb-6">
          <DentGrowLogo size={32} withWordmark />
        </div>
        <h1 className="text-2xl font-semibold text-[#151918] tracking-tight">Create an account</h1>
        <p className="text-sm text-[#737A76]">Access your patient portal</p>
      </div>

      <div className="bg-white border border-[#E3E9E6] rounded-xl p-6 shadow-sm">
        <SignupForm clinics={clinics ?? []} />
      </div>

      <p className="text-center text-xs text-[#737A76]">
        Already have an account?{" "}
        <a href="/login" className="text-[#151918] font-medium hover:underline underline-offset-4">
          Sign in
        </a>
      </p>
    </div>
  );
}

