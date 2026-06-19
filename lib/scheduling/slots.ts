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
 * 5. Return sorted ISO datetime strings for valid slots only.
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
function toMinutes(time: string): number {
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
 *
 * The caller is responsible for filtering by requested duration via
 * getAvailableSlots (which checks the full window fits + no overlaps).
 */
export function generateSlots(rule: AvailabilityRule): string[] {
  const slots: string[] = [];

  const startMins = toMinutes(rule.startTime);
  const endMins = toMinutes(rule.endTime);

  let current = startMins;

  // Generate candidate starts at every slotDuration interval
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
 *
 * @param date               - ISO date string "YYYY-MM-DD"
 * @param rules              - Active availability rules for the date's day_of_week
 * @param occupied           - Existing booked (non-cancelled/no-show) appointments
 * @param timezone           - IANA timezone (e.g. "Asia/Kolkata")
 * @param requestedDurationMinutes - Duration of the appointment being booked (default 30)
 */
export function getAvailableSlots(
  date: string,
  rules: AvailabilityRule[],
  occupied: OccupiedSlot[],
  timezone: string,
  requestedDurationMinutes = 30
): string[] {
  if (rules.length === 0) return [];

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

      // 2. Slot must not overlap any occupied window
      const hasOverlap = occupiedWindows.some(([occStart, occEnd]) => {
        // Overlap when: candidateStart < occEnd AND candidateEnd > occStart
        return candidateStart < occEnd && candidateEnd > occStart;
      });

      if (!hasOverlap) {
        availableSlots.push(`${date}T${candidateTime}:00`);
      }
    }
  }

  // Sort chronologically and deduplicate (multiple rules could produce same time)
  const unique = [...new Set(availableSlots)];
  return unique.sort();
}
