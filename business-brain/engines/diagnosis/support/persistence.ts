/**
 * Business Brain — Diagnosis Engine: persistence classification
 *
 * One shared function, applied to every diagnosis.
 *
 * The rule that matters most: a history day whose evaluator SKIPPED for missing
 * metrics is UNKNOWN, not "did not fire". Treating a missing day as a healthy day
 * would manufacture a recovery that never happened, so a window containing
 * unknowns is capped at `intermittent` and lowers confidence.
 *
 * Breach magnitudes are read from each signal's own recorded evidence. They are
 * never recomputed from thresholds here — the signal already did that maths, and
 * doing it twice invites the two answers to disagree.
 */

import type { SignalType } from "../../../domain";
import { round2 } from "../../signals/support/numbers";
import type { Persistence } from "../../../domain";
import type { DiagnosisConfig } from "../config/diagnosis-config";
import { dateRange, daysBetween } from "./dates";
import { breachMagnitudeOf, type SignalIndex } from "./signal-index";

/** One day of history, reduced to what persistence needs. */
export interface HistoryDay {
  readonly date: string;
  /** Breach magnitude per fired signal type. */
  readonly fired: ReadonlyMap<SignalType, number>;
  /** Types whose evaluator skipped or was suppressed: state unknown. */
  readonly unknown: ReadonlySet<SignalType>;
  /** True when this date was never supplied at all. */
  readonly missing: boolean;
  /** True when signals were re-derived from metrics rather than supplied. */
  readonly derived: boolean;
}

/** The full window the engine was given, normalised. */
export interface HistoryWindow {
  /** Supplied days, ascending, deduplicated, plus reconstructed gap days. */
  readonly days: readonly HistoryDay[];
  /** How many days were actually supplied (gaps excluded). */
  readonly suppliedDays: number;
  /** Dates present in the range but never supplied. */
  readonly gapDates: readonly string[];
  /** Dates whose signals were re-derived from metrics. */
  readonly derivedDates: readonly string[];
  /** Non-fatal observations, surfaced in the engine trace. */
  readonly notes: readonly string[];
}

/** Per-day status of one diagnosis's contributing signal types. */
export type DayStatus = "fired" | "unknown" | "not_fired";

/** The outcome of classifying one diagnosis over the window. */
export interface PersistenceAssessment {
  readonly persistence: Persistence;
  readonly suppliedDays: number;
  /** History dates on which at least one contributing type fired. */
  readonly firedDates: readonly string[];
  /** History dates whose state could not be determined. */
  readonly unknownDates: readonly string[];
  /** History dates on which the contributing types measurably did not fire. */
  readonly notFiredDates: readonly string[];
  /** Consecutive fired days ending today, today included. */
  readonly consecutiveDays: number;
  /** Mean breach magnitude across the earlier and later halves of fired days. */
  readonly trend?: {
    readonly earlierMean: number;
    readonly laterMean: number;
    readonly delta: number;
  };
  /** True when unknown days prevented a sustained/worsening/improving call. */
  readonly cappedByUnknown: boolean;
  /** Human-readable derivation, quoted into evidence. */
  readonly reasoning: string;
}

/** Build a normalised window from already-indexed history days. */
export function buildHistoryWindow(params: {
  readonly currentDate: string;
  readonly supplied: readonly {
    readonly date: string;
    readonly index: SignalIndex;
    readonly derived: boolean;
    readonly evaluatedTypes: readonly SignalType[];
  }[];
}): HistoryWindow {
  const notes: string[] = [];

  // Sort ascending, then dedupe by keeping the LAST entry supplied for a date:
  // a caller re-supplying a day is correcting it, not adding to it.
  const sorted = [...params.supplied].sort((a, b) => {
    const byDate = daysBetween(b.date, a.date);
    return byDate === 0 ? 0 : byDate < 0 ? -1 : 1;
  });
  const byDate = new Map<string, (typeof sorted)[number]>();
  for (const entry of sorted) {
    if (byDate.has(entry.date)) {
      notes.push(`Duplicate history date ${entry.date}: kept the last run supplied.`);
    }
    byDate.set(entry.date, entry);
  }

  const dates = [...byDate.keys()];
  const days: HistoryDay[] = [];
  const gapDates: string[] = [];
  const derivedDates: string[] = [];

  if (dates.length > 0) {
    const earliest = dates[0];
    // The window runs from the earliest supplied day up to the day before the
    // run being diagnosed — a missing date inside it is a gap, not a quiet day.
    const latestExpected = dates[dates.length - 1];
    for (const date of dateRange(earliest, latestExpected)) {
      const entry = byDate.get(date);
      if (!entry) {
        gapDates.push(date);
        days.push({
          date,
          fired: new Map(),
          unknown: new Set(),
          missing: true,
          derived: false,
        });
        continue;
      }
      const fired = new Map<SignalType, number>();
      for (const type of entry.index.types) {
        const signal = entry.index.get(type);
        fired.set(type, signal ? (breachMagnitudeOf(signal) ?? 0) : 0);
      }
      const unknown = new Set<SignalType>();
      for (const type of entry.evaluatedTypes) {
        if (fired.has(type)) continue;
        if (!entry.index.absence(type).informative) unknown.add(type);
      }
      if (entry.derived) derivedDates.push(date);
      days.push({ date, fired, unknown, missing: false, derived: entry.derived });
    }
    if (gapDates.length > 0) {
      notes.push(
        `History window ${earliest}..${latestExpected} is missing ${gapDates.length} date(s): ${gapDates.join(", ")}. Treated as unknown, not as healthy days.`,
      );
    }
    if (daysBetween(latestExpected, params.currentDate) > 1) {
      notes.push(
        `History ends ${latestExpected}, ${daysBetween(latestExpected, params.currentDate)} day(s) before the run date ${params.currentDate}.`,
      );
    }
  }

  return {
    days,
    suppliedDays: byDate.size,
    gapDates,
    derivedDates,
    notes,
  };
}

/** Status of one history day with respect to a set of contributing types. */
function dayStatus(day: HistoryDay, types: readonly SignalType[]): DayStatus {
  if (day.missing) return "unknown";
  if (types.some((type) => day.fired.has(type))) return "fired";
  if (types.some((type) => day.unknown.has(type))) return "unknown";
  return "not_fired";
}

/** Mean breach magnitude on a day across the contributing types that fired. */
function dayBreach(day: HistoryDay, types: readonly SignalType[]): number | null {
  const values = types
    .map((type) => day.fired.get(type))
    .filter((value): value is number => typeof value === "number");
  if (values.length === 0) return null;
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * Classify one diagnosis over the window.
 *
 * `todayBreach` is the mean breach magnitude of the contributing signals in the
 * current run, so the trend includes today rather than stopping at yesterday.
 */
export function classifyPersistence(params: {
  readonly window: HistoryWindow;
  readonly currentDate: string;
  readonly contributingTypes: readonly SignalType[];
  readonly todayBreach: number | null;
  readonly config: DiagnosisConfig;
}): PersistenceAssessment {
  const { window, contributingTypes, config } = params;
  const rules = config.persistence;

  const statuses = window.days.map((day) => ({
    date: day.date,
    status: dayStatus(day, contributingTypes),
    breach: dayBreach(day, contributingTypes),
  }));
  const firedDates = statuses.filter((s) => s.status === "fired").map((s) => s.date);
  const unknownDates = statuses.filter((s) => s.status === "unknown").map((s) => s.date);
  const notFiredDates = statuses.filter((s) => s.status === "not_fired").map((s) => s.date);

  // Consecutive run ending today: walk backwards from the day before the run
  // date. An unknown day breaks the chain — it cannot be claimed as a fired day.
  let consecutiveDays = 1;
  for (let offset = 1; ; offset++) {
    const target = statuses.find(
      (s) => daysBetween(s.date, params.currentDate) === offset,
    );
    if (!target || target.status !== "fired") break;
    consecutiveDays += 1;
  }

  const firedSeries = [
    ...statuses
      .filter((s) => s.status === "fired")
      .map((s) => s.breach ?? 0),
    ...(params.todayBreach === null ? [] : [params.todayBreach]),
  ];
  let trend: PersistenceAssessment["trend"];
  if (firedSeries.length >= 2) {
    const split = Math.floor(firedSeries.length / 2);
    const earlierMean = mean(firedSeries.slice(0, split));
    const laterMean = mean(firedSeries.slice(split));
    trend = { earlierMean, laterMean, delta: round2(laterMean - earlierMean) };
  }

  const hasUnknown = unknownDates.length > 0;
  let persistence: Persistence;
  let cappedByUnknown = false;
  let reasoning: string;

  if (window.suppliedDays < rules.minimumHistoryDays) {
    persistence = "insufficient_history";
    reasoning = `${window.suppliedDays} history day(s) supplied, below the minimum ${rules.minimumHistoryDays}; no baseline was assumed.`;
  } else if (firedDates.length === 0) {
    persistence = "transient";
    reasoning = hasUnknown
      ? `Fired today and on no known day of the ${window.days.length}-day window (${unknownDates.length} day(s) unknown).`
      : `Fired today and on no day of the ${window.days.length}-day window.`;
  } else {
    const sustained = consecutiveDays >= rules.sustainedDays;
    const worsening = sustained && !!trend && trend.delta > rules.trendTolerance;
    const improving = !!trend && trend.delta < -rules.trendTolerance;

    // Order matters. A direction of travel beats a duration: a breach that has
    // fired for five days but is shrinking every day is "improving", not
    // "sustained", and the severity adjustment should follow the direction.
    if (hasUnknown && (sustained || improving)) {
      persistence = "intermittent";
      cappedByUnknown = true;
      reasoning = `Fired on ${firedDates.length} prior day(s) with ${unknownDates.length} day(s) unknown, so the window cannot support a sustained, worsening, or improving claim.`;
    } else if (worsening) {
      persistence = "worsening";
      reasoning = `Fired ${consecutiveDays} consecutive day(s) including today, and mean breach magnitude rose ${trend?.delta} across the window (tolerance ${rules.trendTolerance}).`;
    } else if (improving) {
      persistence = "improving";
      reasoning = `Fired today and on ${firedDates.length} prior day(s), with mean breach magnitude falling ${trend?.delta} across the window (tolerance ${rules.trendTolerance}).`;
    } else if (sustained) {
      persistence = "sustained";
      reasoning = `Fired ${consecutiveDays} consecutive day(s) including today, at or above the sustained threshold ${rules.sustainedDays}. Mean breach change ${trend?.delta ?? 0} is within tolerance ${rules.trendTolerance}.`;
    } else {
      persistence = "intermittent";
      reasoning = `Fired today and on ${firedDates.length} prior day(s), ${consecutiveDays} of them consecutively, below the sustained threshold ${rules.sustainedDays}.`;
    }
  }

  return {
    persistence,
    suppliedDays: window.suppliedDays,
    firedDates,
    unknownDates,
    notFiredDates,
    consecutiveDays,
    trend,
    cappedByUnknown,
    reasoning,
  };
}
