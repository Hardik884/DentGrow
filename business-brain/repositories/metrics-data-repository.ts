/**
 * Business Brain — Repositories: Metrics Data Port
 *
 * The port the Metrics Engine depends on to obtain a clinic's data snapshot.
 * This is an interface only — the concrete, Supabase-backed implementation
 * that reads DentGrow tables belongs to a future phase. Keeping the engine
 * behind this port means the engine never touches the database and is trivial
 * to unit-test with an in-memory fake.
 */

import type { ClinicDataSnapshot } from "./snapshots";

export interface MetricsDataRepository {
  /**
   * Return the data snapshot for a clinic on a given business date.
   *
   * @param clinicId - the clinic to scope data to.
   * @param date     - the business date, "YYYY-MM-DD".
   */
  getClinicSnapshot(clinicId: string, date: string): Promise<ClinicDataSnapshot>;
}
