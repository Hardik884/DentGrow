import type { Metadata } from "next";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { DentGrowLogo } from "@/components/shared/DentGrowLogo";

export const metadata: Metadata = {
  title: "Set New Password",
  description: "Choose a new password for your DentGrow patient account.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="space-y-8">
      {/* Brand */}
      <div className="space-y-1.5">
        <div className="mb-6">
          <DentGrowLogo size={32} withWordmark />
        </div>
        <h1 className="text-2xl font-semibold text-[#151918] tracking-tight">Set a new password</h1>
        <p className="text-sm text-[#737A76]">Choose a strong password you don&apos;t use elsewhere.</p>
      </div>

      {/* Card */}
      <div className="bg-white border border-[#E3E9E6] rounded-xl p-6 shadow-sm">
        <ResetPasswordForm linkError={error === "link"} />
      </div>

      <p className="text-center text-xs text-[#737A76]">
        <a href="/login" className="text-[#151918] font-medium hover:underline underline-offset-4">
          Back to sign in
        </a>
      </p>
    </div>
  );
}
