/**
 * components/dental-chart/DentalChart.tsx
 *
 * Client orchestrator for the Dental Chart: dentition toggle, multi-select,
 * legend, the two arches, the tooth detail panel, and the bulk-update
 * dialog. Receives the initial (adult) chart pre-fetched server-side so the
 * chart is visible immediately; switching dentition re-fetches client-side
 * via the same server action.
 */

"use client";

import { useMemo, useState } from "react";
import { getPatientDentalChart } from "@/actions/dental-chart";
import { getDentalChartLayout } from "@/lib/dental-chart/teeth";
import { DentalArch } from "./DentalArch";
import { ToothLegend } from "./ToothLegend";
import { ToothDetailPanel } from "./ToothDetailPanel";
import { BulkUpdateTeethDialog } from "./BulkUpdateTeethDialog";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { cn } from "@/lib/utils";
import type { PatientDentalChart, PatientTooth, DentitionType } from "@/types";

export type DentalChartProps = {
  patientId: string;
  patientName?: string;
  /** Present when embedded on the Patient Visit page — prefills new treatments to this visit. */
  appointmentId?: string;
  initialChart: PatientDentalChart;
};

export function DentalChart({ patientId, patientName, appointmentId, initialChart }: DentalChartProps) {
  const [dentitionType, setDentitionType] = useState<DentitionType>(initialChart.dentitionType);
  const [chart, setChart] = useState<PatientDentalChart>(initialChart);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedTeeth, setSelectedTeeth] = useState<Set<number>>(new Set());
  const [activeToothNumber, setActiveToothNumber] = useState<number | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const layout = useMemo(() => getDentalChartLayout(dentitionType), [dentitionType]);
  const toothByNumber = useMemo(() => {
    const map = new Map<number, PatientTooth | null>();
    for (const entry of chart.teeth) map.set(entry.toothNumber, entry.tooth);
    return map;
  }, [chart]);
  const activeEntry = useMemo(
    () => chart.teeth.find((t) => t.toothNumber === activeToothNumber) ?? null,
    [chart, activeToothNumber]
  );

  async function refetch(nextDentition: DentitionType) {
    setLoading(true);
    setError(null);
    const result = await getPatientDentalChart(patientId, nextDentition);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.data) setChart(result.data);
  }

  function handleDentitionChange(value: DentitionType) {
    setDentitionType(value);
    setSelectedTeeth(new Set());
    setActiveToothNumber(null);
    void refetch(value);
  }

  function handleToothClick(toothNumber: number) {
    if (multiSelectMode) {
      setSelectedTeeth((prev) => {
        const next = new Set(prev);
        if (next.has(toothNumber)) next.delete(toothNumber);
        else next.add(toothNumber);
        return next;
      });
      return;
    }
    setActiveToothNumber(toothNumber);
  }

  function handleResetSelection() {
    setSelectedTeeth(new Set());
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="dentition-type" className="text-xs font-medium text-text-secondary">
            Tooth Set
          </label>
          <Select
            id="dentition-type"
            className="!w-auto h-8 text-xs"
            value={dentitionType}
            onChange={(e) => handleDentitionChange(e.target.value as DentitionType)}
          >
            <option value="adult">Adult</option>
            <option value="primary">Primary</option>
          </Select>
          {loading && <LoadingSpinner size="sm" />}
        </div>

        <div className="flex items-center gap-2">
          {selectedTeeth.size > 0 && (
            <Button variant="ghost" size="xs" onClick={handleResetSelection}>
              Clear ({selectedTeeth.size})
            </Button>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={multiSelectMode}
            onClick={() => {
              setMultiSelectMode((v) => !v);
              setSelectedTeeth(new Set());
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              multiSelectMode
                ? "bg-accent text-accent-foreground border-accent"
                : "bg-surface text-text-secondary border-border hover:bg-surface-muted"
            )}
          >
            <span
              className={cn(
                "inline-block h-3.5 w-3.5 rounded-full border transition-colors",
                multiSelectMode ? "bg-surface border-white" : "bg-transparent border-border-strong"
              )}
              aria-hidden
            />
            Multi-select
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-danger-bg border border-danger-border px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {/* Chart */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <div className="min-w-[640px] py-6 px-4 space-y-2">
          <DentalArch
            teeth={layout.upper}
            toothByNumber={toothByNumber}
            selectedTeeth={selectedTeeth}
            multiSelectMode={multiSelectMode}
            onToothClick={handleToothClick}
            activeToothNumber={activeToothNumber}
          />
          <div className="flex items-center gap-2 px-2" aria-hidden>
            <div className="flex-1 border-t border-dashed border-border" />
            <span className="text-[10px] uppercase tracking-wide text-border-strong">Bite line</span>
            <div className="flex-1 border-t border-dashed border-border" />
          </div>
          <DentalArch
            teeth={layout.lower}
            toothByNumber={toothByNumber}
            selectedTeeth={selectedTeeth}
            multiSelectMode={multiSelectMode}
            onToothClick={handleToothClick}
            activeToothNumber={activeToothNumber}
          />
        </div>
      </div>

      {/* Legend */}
      <ToothLegend />

      {/* Multi-select action bar */}
      {multiSelectMode && selectedTeeth.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-2.5">
          <p className="text-xs text-text-body">
            <span className="font-semibold text-text-primary">{selectedTeeth.size}</span> teeth selected
          </p>
          <Button size="sm" onClick={() => setBulkOpen(true)}>
            Add Treatment to Selected
          </Button>
        </div>
      )}

      <ToothDetailPanel
        open={!!activeEntry}
        onClose={() => setActiveToothNumber(null)}
        entry={activeEntry}
        patientId={patientId}
        patientName={patientName}
        appointmentId={appointmentId}
        dentitionType={dentitionType}
        onSaved={() => void refetch(dentitionType)}
      />

      <BulkUpdateTeethDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        patientId={patientId}
        dentitionType={dentitionType}
        toothNumbers={Array.from(selectedTeeth)}
        onSaved={() => {
          setSelectedTeeth(new Set());
          void refetch(dentitionType);
        }}
      />
    </div>
  );
}
