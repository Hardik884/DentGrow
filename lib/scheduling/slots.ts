/**
 * lib/scheduling/slots.ts
 *
 * Pure slot generation + overlap prevention engine.
 * No DB calls — all data is passed in by the caller (actions/availability.ts).
 * Intentionally pure so it can be tested without DB access.
 *
 * Algorithm (duration-aware):
 * 1. Receive active availability rules for the requested date's day_of_week.
 * 2. For each rule, generate candidate slot start times between start_time and
 *    end_time at slot_duration_minutes intervals.
 * 3. For each candidate, verify that [slot_start, slot_start + requestedDuration)
 *    does NOT overlap any existing booked appointment's occupied window
 *    [appt_start, appt_start + appt_duration).
 * 4. Also verify the entire requested window fits within the rule's [start, end).
 * 5. Optionally filter out slots whose start time is before nowCutoffMinutes
 *    (used when the requested date is today, to hide past slots).
 * 6. Return sorted ISO datetime strings for valid slots only.
 *
 * This supports variable-duration appointments:
 *   - A 60-min root canal cannot fit in a 30-min gap.
 *   - A 10-min consultation can fit in many gaps a root canal could not.
 */

export interface AvailabilityRule {
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  slotDurationMinutes: number; // step size for generating candidates
}

export interface OccupiedSlot {
  scheduledAt: string;         // ISO datetime — start of the booked appointment
  durationMinutes?: number;    // duration of the booked appointment (default 30)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Parse "HH:MM" → total minutes from midnight */
export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Convert total minutes from midnight → "HH:MM" */
function fromMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (totalMinutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// ── Core functions ─────────────────────────────────────────────────────────────

/**
 * generateSlots
 *
 * Generates all candidate slot start times for a single availability rule.
 * Uses rule.slotDurationMinutes as the step size.
 * Returns an array of "HH:MM" time strings.
 */
export function generateSlots(rule: AvailabilityRule): string[] {
  const slots: string[] = [];

  const startMins = toMinutes(rule.startTime);
  const endMins = toMinutes(rule.endTime);

  let current = startMins;

  while (current < endMins) {
    slots.push(fromMinutes(current));
    current += rule.slotDurationMinutes;
  }

  return slots;
}

/**
 * getAvailableSlots
 *
 * Returns available ISO datetime strings for the given date after:
 * 1. Generating candidate times from availability rules.
 * 2. Filtering out slots where [candidate, candidate + requestedDuration)
 *    would overlap any occupied appointment window.
 * 3. Filtering out slots where the full window would exceed the rule boundary.
 * 4. Filtering out slots that are in the past (when nowCutoffMinutes is set).
 *
 * @param date                   - ISO date string "YYYY-MM-DD"
 * @param rules                  - Active availability rules for the date's day_of_week
 * @param occupied               - Existing booked (non-cancelled/no-show) appointments
 * @param timezone               - IANA timezone (e.g. "Asia/Kolkata")
 * @param requestedDurationMinutes - Duration of the appointment being booked (default 30)
 * @param nowCutoffMinutes       - Current time in minutes-since-midnight (clinic timezone).
 *                                 When provided, all slots starting at or before this
 *                                 value are filtered out. Pass null/undefined for
 *                                 future dates where no cutoff is needed.
 * @param blockedRanges          - Time ranges ("HH:MM") blocked by external consultancy
 *                                 schedules. Any candidate overlapping one is removed.
 */
export function getAvailableSlots(
  date: string,
  rules: AvailabilityRule[],
  occupied: OccupiedSlot[],
  timezone: string,
  requestedDurationMinutes = 30,
  nowCutoffMinutes?: number | null,
  blockedRanges?: Array<{ start: string; end: string }>
): string[] {
  if (rules.length === 0) return [];

  // Build blocked windows (consultancy schedules) as [start, end) minute pairs.
  const blockedWindows: Array<[number, number]> = (blockedRanges ?? []).map(
    (range) => [toMinutes(range.start), toMinutes(range.end)]
  );

  // Build occupied windows as [startMinutes, endMinutes) pairs
  const occupiedWindows: Array<[number, number]> = occupied.map((slot) => {
    const d = new Date(slot.scheduledAt);
    const localTime = d
      .toLocaleTimeString("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      .slice(0, 5); // "HH:MM"

    const startMins = toMinutes(localTime);
    const duration = slot.durationMinutes ?? 30;
    return [startMins, startMins + duration];
  });

  const availableSlots: string[] = [];

  for (const rule of rules) {
    const candidates = generateSlots(rule);
    const ruleEndMins = toMinutes(rule.endTime);

    for (const candidateTime of candidates) {
      const candidateStart = toMinutes(candidateTime);
      const candidateEnd = candidateStart + requestedDurationMinutes;

      // 1. Entire slot must fit within the rule window
      if (candidateEnd > ruleEndMins) continue;

      // 2. Filter out past slots when a cutoff is provided (today only)
      //    A slot is considered past if it has already started (start <= now).
      //    We use strict ">" so that the CURRENT slot (just started) is also hidden.
      if (nowCutoffMinutes != null && candidateStart <= nowCutoffMinutes) continue;

      // 3. Slot must not overlap any occupied window
      const hasOverlap = occupiedWindows.some(([occStart, occEnd]) => {
        return candidateStart < occEnd && candidateEnd > occStart;
      });
      if (hasOverlap) continue;

      // 4. Slot must not overlap any consultancy-blocked window
      const isBlocked = blockedWindows.some(([blockStart, blockEnd]) => {
        return candidateStart < blockEnd && candidateEnd > blockStart;
      });
      if (isBlocked) continue;

      availableSlots.push(`${date}T${candidateTime}:00`);
    }
  }

  // Sort chronologically and deduplicate (multiple rules could produce same time)
  const unique = [...new Set(availableSlots)];
  return unique.sort();
}
