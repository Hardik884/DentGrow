"use client";

import { useState, useTransition } from "react";
import { checkInPatient } from "@/actions/queue";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

interface CheckInButtonProps {
  appointmentId: string;
  isCheckedIn?: boolean;
}

export function CheckInButton({ appointmentId, isCheckedIn = false }: CheckInButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [isDone, setIsDone] = useState(isCheckedIn);
  const [error, setError] = useState<string | null>(null);

  function handleCheckIn() {
    setError(null);
    startTransition(async () => {
      const result = await checkInPatient(appointmentId);
      if (result.error) { setError(result.error); return; }
      setIsDone(true);
    });
  }

  if (isDone) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F0FDF4] text-[#16A34A] text-xs font-medium rounded-lg border border-[#BBF7D0]">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Checked In
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Button size="sm" onClick={handleCheckIn} disabled={isPending} isLoading={isPending}>
        {isPending ? "Checking in…" : "Check In Patient"}
      </Button>
      {error && <p className="text-xs text-[#DC2626]" role="alert">{error}</p>}
    </div>
  );
}
