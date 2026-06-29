import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { DentGrowLogo } from "@/components/shared/DentGrowLogo";
import { getClinics } from "@/actions/clinics";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your DentGrow account.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;
  const { data: clinics } = await getClinics();

  return (
    <div className="space-y-8">
      {/* Brand */}
      <div className="space-y-1.5">
        <div className="mb-6">
          <DentGrowLogo size={32} withWordmark />
        </div>
        <h1 className="text-2xl font-semibold text-[#09090B] tracking-tight">Welcome back</h1>
      </div>

      {/* Card */}
      <div className="bg-white border border-[#E4E4E7] rounded-xl p-6 shadow-sm">
        <LoginForm clinics={clinics ?? []} resetSuccess={reset === "1"} />
      </div>

      <p className="text-center text-xs text-[#71717A]">
        New patient?{" "}
        <a href="/signup" className="text-[#09090B] font-medium hover:underline underline-offset-4">
          Create an account
        </a>
      </p>
    </div>
  );
}

