"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import type { ClinicHealth } from "@/lib/business-brain/clinic-health";
import type { ActionCardView, ProblemView } from "@/lib/business-brain/briefing-view";
import { HealthMeter } from "./HealthMeter";
import { ProblemCard } from "./ProblemCard";
import { ActionCard } from "./ActionCard";

interface MorningBriefingProps {
  health: ClinicHealth;
  problems: readonly ProblemView[];
  actions: readonly ActionCardView[];
}

/**
 * The whole page below the title: the health score, then two columns.
 *
 * It owns the small amount of interaction state — which actions the user has
 * worked through this session, and the brief "+N Health" note when finishing a
 * task genuinely moved the score. The score and the problem list themselves are
 * always the server's live truth; this never invents either.
 */
export function MorningBriefing({ health, problems, actions }: MorningBriefingProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [delta, setDelta] = useState<{ points: number; reason: string } | null>(null);

  // Detect a genuine score rise across a refresh, and attribute it to the last
  // completed action. If the score didn't actually move, no note is shown — a
  // ticked checklist that changed no real data earns no health bump.
  const prevScore = useRef(health.score);
  const pendingReason = useRef<string | null>(null);

  useEffect(() => {
    if (health.score > prevScore.current && pendingReason.current) {
      setDelta({ points: health.score - prevScore.current, reason: pendingReason.current });
      pendingReason.current = null;
      const t = setTimeout(() => setDelta(null), 3200);
      prevScore.current = health.score;
      return () => clearTimeout(t);
    }
    prevScore.current = health.score;
  }, [health.score]);

  function handleComplete(action: ActionCardView) {
    setDismissed((prev) => new Set(prev).add(action.id));
    pendingReason.current = action.doneReason;
    // Re-read live data: if the real work was done, the score and problems move.
    router.refresh();
  }

  const visibleActions = actions.filter((a) => !dismissed.has(a.id));
  const allClear = problems.length === 0;

  return (
    <div className="space-y-6">
      <HealthMeter health={health} delta={delta} />

      {allClear ? (
        <div className="bg-white border border-[#E4E4E7] rounded-xl px-6 py-10 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#F0FDF4] mb-3">
            <CheckCircle2 className="h-5 w-5 text-[#16A34A]" aria-hidden />
          </div>
          <h2 className="text-base font-semibold text-[#09090B]">Everything looks good today</h2>
          <p className="text-sm text-[#71717A] mt-1">
            Nothing needs your attention right now. Your clinic is running as expected.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Problems */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-[#09090B]">Needs attention</h2>
              <span className="text-xs text-[#A1A1AA]">{problems.length}</span>
            </div>
            {problems.map((p) => (
              <ProblemCard key={p.id} problem={p} />
            ))}
          </div>

          {/* Right: Actions */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-[#09090B]">What to do</h2>
              <span className="text-xs text-[#A1A1AA]">{visibleActions.length}</span>
            </div>
            {visibleActions.length > 0 ? (
              visibleActions.map((a) => (
                <ActionCard key={a.id} action={a} onComplete={handleComplete} />
              ))
            ) : (
              <div className="bg-white border border-[#E4E4E7] rounded-xl px-5 py-8 text-center">
                <p className="text-sm text-[#71717A]">
                  You&apos;ve worked through everything here. Nice.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
