"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClinicHealth, HealthBand } from "@/lib/business-brain/clinic-health";

/**
 * One sparing accent per band. Everything else on the page stays monochrome.
 *
 * These are utility classes rather than hex strings because they used to be
 * applied through `style={{ color }}`, and an inline style wins over any
 * stylesheet — the band colour would have stayed at its light value on a dark
 * page. As classes they resolve through the theme's status tokens.
 */
const BAND_COLOR: Record<HealthBand, string> = {
  excellent: "text-success",
  good: "text-success",
  attention: "text-warning",
  urgent: "text-danger",
};

/** The same four bands, for the SVG progress ring. */
const BAND_STROKE: Record<HealthBand, string> = {
  excellent: "stroke-success",
  good: "stroke-success",
  attention: "stroke-warning",
  urgent: "stroke-danger",
};

interface HealthMeterProps {
  health: ClinicHealth;
  /** When set, briefly floats "+N Health · reason" — shown after an action resolves something. */
  delta?: { points: number; reason: string } | null;
}

/**
 * The Clinic Health Score — the first thing on the page.
 *
 * A single number in a ring, a one-word verdict, and (on request) the itemised
 * list of exactly what is holding the score below 100. The breakdown is what
 * makes the number trustworthy: it is never shown alone.
 */
export function HealthMeter({ health, delta }: HealthMeterProps) {
  const [open, setOpen] = useState(false);
  const bandColorClass = BAND_COLOR[health.band];
  const bandStrokeClass = BAND_STROKE[health.band];

  // Ring geometry.
  const size = 92;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (health.score / 100) * circumference;

  return (
    <section className="relative bg-surface border border-border rounded-xl">
      <div className="flex items-center gap-5 px-6 py-5">
        {/* Ring */}
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              className="stroke-surface-muted"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              className={bandStrokeClass}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              style={{ transition: "stroke-dasharray 600ms ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-semibold text-text-primary tabular-nums leading-none">
              {health.score}
            </span>
          </div>
        </div>

        {/* Verdict */}
        <div className="min-w-0">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">Clinic Health</div>
          <div className={cn("text-xl font-semibold mt-0.5", bandColorClass)}>
            {health.bandLabel}
          </div>
          <div className="text-sm text-text-secondary mt-0.5">
            {health.deductions.length === 0
              ? "Nothing is holding your score back today."
              : `${health.deductions.length} thing${health.deductions.length === 1 ? "" : "s"} bringing it down.`}
          </div>
        </div>

        {/* Score-change toast */}
        {delta && (
          <div className="absolute right-6 top-4 animate-score-pop text-right">
            <div className={cn("text-sm font-semibold", BAND_COLOR.excellent)}>
              +{delta.points} Health
            </div>
            <div className="text-xs text-text-secondary">{delta.reason}</div>
          </div>
        )}
      </div>

      {/* Breakdown — the score is never a lone number */}
      {health.deductions.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="w-full flex items-center justify-between gap-3 px-6 py-2.5 border-t border-surface-muted text-left hover:bg-background transition-colors cursor-pointer"
          >
            <span className="text-sm text-text-body">{open ? "Hide breakdown" : "What's affecting this"}</span>
            <ChevronDown
              className={cn("h-4 w-4 text-text-disabled shrink-0 transition-transform", open && "rotate-180")}
              aria-hidden
            />
          </button>
          {open && (
            <ul className="px-6 pb-4 pt-1 space-y-2 animate-fade-in">
              {health.deductions.map((d) => (
                <li key={d.factor} className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-text-body">{d.detail}</span>
                  <span className="text-sm font-medium text-text-secondary tabular-nums shrink-0">
                    &minus;{d.points}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
