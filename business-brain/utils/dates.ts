/**
 * Business Brain — calendar arithmetic
 *
 * Shared by the Diagnosis Engine (which must know whether two fired days are
 * adjacent, and which dates in a window were never supplied) and the Metrics
 * Engine (which needs trailing-window boundaries). Every engine is forbidden
 * from touching `Date`.
 *
 * So dates are handled as "YYYY-MM-DD" strings converted to a day number via a
 * pure proleptic-Gregorian formula. No `Date`, no timezone, no locale, no clock:
 * the same string always produces the same number on every machine.
 */

/** Whether a string is a well-formed "YYYY-MM-DD" calendar date. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Days since 1970-01-01 for a "YYYY-MM-DD" date.
 * Howard Hinnant's civil-from-days algorithm, inverted; integer maths only.
 */
export function toDayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const shiftedYear = m <= 2 ? y - 1 : y;
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const dayOfYear = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** The "YYYY-MM-DD" date that many days after 1970-01-01. */
export function fromDayNumber(days: number): string {
  const shifted = days + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from);
}

/** Shift a date by a whole number of days. */
export function addDays(date: string, days: number): string {
  return fromDayNumber(toDayNumber(date) + days);
}

/**
 * Every calendar date from `from` to `to` inclusive, ascending.
 * Returns an empty array when `to` precedes `from`.
 */
export function dateRange(from: string, to: string): string[] {
  const span = daysBetween(from, to);
  if (span < 0) return [];
  const dates: string[] = [];
  for (let offset = 0; offset <= span; offset++) dates.push(addDays(from, offset));
  return dates;
}
