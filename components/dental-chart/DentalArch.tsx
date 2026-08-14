/**
 * components/dental-chart/DentalArch.tsx
 *
 * One arch (upper or lower) of the Dental Chart: a row of clickable Tooth
 * shapes with their FDI numbers, split into a patient-right and patient-left
 * half with a visible midline gap — the layout requirement that "the
 * midline should be visually obvious".
 *
 * Numbers sit on the OUTER edge of each arch (above the upper row, below the
 * lower row) so the crowns of both arches meet at the shared gap between
 * them, reading as an open mouth — upper teeth hanging down, lower teeth
 * rising up to meet them.
 */

"use client";

import { Tooth } from "./Tooth";
import { getToothType, type ToothIdentity } from "@/lib/dental-chart/teeth";
import type { PatientTooth } from "@/types";
import { cn } from "@/lib/utils";

export type DentalArchProps = {
  teeth: ToothIdentity[];
  toothByNumber: Map<number, PatientTooth | null>;
  selectedTeeth: Set<number>;
  multiSelectMode: boolean;
  onToothClick: (toothNumber: number) => void;
  activeToothNumber?: number | null;
};

export function DentalArch({
  teeth,
  toothByNumber,
  selectedTeeth,
  multiSelectMode,
  onToothClick,
  activeToothNumber,
}: DentalArchProps) {
  const arch = teeth[0]?.arch ?? "upper";
  const midpoint = Math.ceil(teeth.length / 2);
  const rightHalf = teeth.slice(0, midpoint);
  const leftHalf = teeth.slice(midpoint);

  return (
    <div className="flex items-start justify-center gap-3 sm:gap-5 min-w-max px-2">
      <ArchHalf
        teeth={rightHalf}
        arch={arch}
        toothByNumber={toothByNumber}
        selectedTeeth={selectedTeeth}
        multiSelectMode={multiSelectMode}
        onToothClick={onToothClick}
        activeToothNumber={activeToothNumber}
      />
      {/* Midline */}
      <div
        className="w-px self-stretch bg-[#E4E4E7] mx-1 sm:mx-2"
        aria-hidden
        title="Midline"
      />
      <ArchHalf
        teeth={leftHalf}
        arch={arch}
        toothByNumber={toothByNumber}
        selectedTeeth={selectedTeeth}
        multiSelectMode={multiSelectMode}
        onToothClick={onToothClick}
        activeToothNumber={activeToothNumber}
      />
    </div>
  );
}

function ArchHalf({
  teeth,
  arch,
  toothByNumber,
  selectedTeeth,
  multiSelectMode,
  onToothClick,
  activeToothNumber,
}: {
  teeth: ToothIdentity[];
  arch: "upper" | "lower";
  toothByNumber: Map<number, PatientTooth | null>;
  selectedTeeth: Set<number>;
  multiSelectMode: boolean;
  onToothClick: (toothNumber: number) => void;
  activeToothNumber?: number | null;
}) {
  return (
    <div className="flex items-start gap-1 sm:gap-1.5">
      {teeth.map((identity) => {
        const tooth = toothByNumber.get(identity.toothNumber) ?? null;
        const status = tooth?.status ?? "normal";
        const isSelected = selectedTeeth.has(identity.toothNumber);
        const isActive = activeToothNumber === identity.toothNumber;
        const numberLabel = (
          <span
            className={cn(
              "text-[11px] font-medium tabular-nums transition-colors",
              isActive ? "text-[#18181B] font-semibold" : "text-[#71717A]"
            )}
          >
            {identity.toothNumber}
          </span>
        );

        return (
          <button
            key={identity.toothNumber}
            type="button"
            onClick={() => onToothClick(identity.toothNumber)}
            aria-pressed={multiSelectMode ? isSelected : isActive}
            aria-label={`Tooth ${identity.toothNumber} — ${status.replace("_", " ")}`}
            title={`Tooth ${identity.toothNumber}`}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 transition-all",
              "hover:bg-[#F4F4F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181B] focus-visible:ring-offset-1",
              isSelected && "ring-2 ring-[#18181B] bg-[#F4F4F5]",
              isActive && !multiSelectMode && "bg-[#F4F4F5]"
            )}
          >
            {arch === "upper" && numberLabel}
            <Tooth
              toothType={getToothType(identity.dentitionType, identity.position)}
              arch={arch}
              status={status}
              size={38}
            />
            {arch === "lower" && numberLabel}
          </button>
        );
      })}
    </div>
  );
}
