/**
 * Business Brain — Action Engine: date windows
 *
 * The filter values an action needs are almost all date bounds: "cancellations
 * in the last 7 days", "tomorrow's list", "this week's completed treatments".
 * They are derived once per run from the business date and handed to the catalog,
 * so no capability does its own arithmetic and none of them can disagree about
 * when "this week" starts.
 *
 * No `Date`, no clock, no timezone — the business date arrives already resolved
 * in the clinic's timezone, and everything here is integer arithmetic over it
 * (see ../../utils/dates.ts). Same date in, same window out, on any machine.
 */

import { addDays, toDayNumber } from "../../utils";

/** Date bounds every action filter is built from. */
export interface ActionDateWindows {
  readonly today: string;
  readonly tomorrow: string;
  /** Today plus the next two days — the reminder horizon. */
  readonly threeDayEnd: string;
  readonly last7Start: string;
  readonly last14Start: string;
  readonly last30Start: string;
  readonly last90Start: string;
  /** Monday of the current week, matching the app's quick filters. */
  readonly weekStart: string;
  /** Sunday of the current week. */
  readonly weekEnd: string;
  readonly monthStart: string;
  readonly monthEnd: string;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Derive every window from one business date.
 *
 * The week runs Monday to Sunday, which is what `getDateRangePresets` in
 * lib/utils uses for the quick-filter chips. Matching it is not cosmetic: an
 * action that opened "this week" on a different boundary than the chip beside it
 * would show a different list for the same words.
 */
export function actionDateWindows(date: string): ActionDateWindows {
  // Day 0 (1970-01-01) was a Thursday, so +4 puts Sunday at 0.
  const weekday = (((toDayNumber(date) + 4) % 7) + 7) % 7;
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const weekStart = addDays(date, mondayOffset);

  const [year, month] = date.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");

  return {
    today: date,
    tomorrow: addDays(date, 1),
    threeDayEnd: addDays(date, 2),
    last7Start: addDays(date, -6),
    last14Start: addDays(date, -13),
    last30Start: addDays(date, -29),
    last90Start: addDays(date, -89),
    weekStart,
    weekEnd: addDays(weekStart, 6),
    monthStart: `${date.slice(0, 7)}-01`,
    monthEnd: `${date.slice(0, 7)}-${pad(daysInMonth(year, month))}`,
  };
}
