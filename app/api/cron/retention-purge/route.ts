import { type NextRequest, NextResponse } from "next/server";

import { secretsMatch } from "@/lib/security/timing-safe";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENT_BUCKET } from "@/lib/treatments/constants";

/**
 * POST /api/cron/retention-purge
 *
 * Applies the retention policies in `retention_policies` (migration
 * 20260903000500).
 *
 * DRY RUN BY DEFAULT
 *   With no body, or `{"dryRun": true}`, it counts and deletes nothing. Only
 *   `{"dryRun": false}` removes anything. A delete endpoint whose default is to
 *   delete is one that eventually deletes something because a request was
 *   malformed, and the counts are the whole point of running it the first
 *   several times.
 *
 * WHAT IT WILL NEVER TOUCH
 *   Clinical and audit records. The SQL function it calls has an explicit CASE
 *   over a fixed set of operational tables, so a new policy row cannot by
 *   itself cause a clinical table to be deleted from. This endpoint adds one
 *   thing the database cannot do — clearing storage objects for documents that
 *   were removed longer ago than the grace period — and nothing else.
 *
 * WHY DOCUMENT PURGING LIVES HERE AND NOT IN SQL
 *   Postgres cannot reach object storage. If the SQL function deleted the
 *   metadata row, the file would be orphaned in the bucket permanently, with
 *   nothing left pointing at it — a radiograph that is deleted from the record
 *   but not from disk is the worst of both outcomes. So the object goes first,
 *   and only then the row.
 *
 * NOT SCHEDULED YET.
 *   → REQUIRES MANUAL CONFIGURATION: run this in dry-run mode against real
 *     data, read the counts, and only then add a pg_cron schedule. See
 *     docs/RETENTION.md.
 *
 * Auth: bearer token compared in constant time, and refuses to run at all when
 * CRON_SECRET is unset — same contract as the other two cron endpoints. This
 * one deletes, so an unauthenticated caller could purge every clinic's
 * operational history.
 */

export const maxDuration = 60;

/** Documents cleared per run. A bound, so one run cannot hold the lock forever. */
const DOCUMENT_BATCH = 200;

type DocumentPurgeOutcome = {
  eligible: number;
  objectsRemoved: number;
  rowsRemoved: number;
  failures: number;
};

export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fail closed — an unset secret must never read as "no auth required".
    console.error("[cron/retention-purge] CRON_SECRET is not set; refusing to run.");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!secretsMatch(token, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Anything other than an explicit `false` is a dry run, including a malformed
  // or absent body.
  let dryRun = true;
  try {
    const body = await request.json();
    dryRun = (body as { dryRun?: unknown })?.dryRun !== false;
  } catch {
    dryRun = true;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db: any = createAdminClient();

    const { data: report, error } = await db.rpc("run_retention_purge", {
      p_dry_run: dryRun,
    });

    if (error) {
      console.error("[cron/retention-purge] rpc failed:", error);
      return NextResponse.json({ error: "Purge failed" }, { status: 500 });
    }

    const documents = await purgeRemovedDocuments(db, dryRun);

    console.info("[cron/retention-purge]", {
      dryRun,
      documents,
    });

    return NextResponse.json({ ok: true, dryRun, report, documents });
  } catch (error) {
    console.error("[cron/retention-purge] unexpected", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Clears storage objects for documents whose grace period has expired, then the
 * rows that pointed at them.
 *
 * Order matters and is the reason this is written out rather than folded into
 * the SQL: object first, row second. A crash between the two leaves an
 * unreferenced object, which the next run cannot find — an acceptable and
 * bounded loss. The reverse order would leave a live file with nothing pointing
 * at it and no way to ever locate it again.
 */
async function purgeRemovedDocuments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  dryRun: boolean
): Promise<DocumentPurgeOutcome> {
  const outcome: DocumentPurgeOutcome = {
    eligible: 0,
    objectsRemoved: 0,
    rowsRemoved: 0,
    failures: 0,
  };

  const { data: policy } = await db
    .from("retention_policies")
    .select("retain_days, enabled")
    .eq("key", "deleted_treatment_documents")
    .maybeSingle();

  if (!policy?.enabled || !policy.retain_days) return outcome;

  const cutoff = new Date(
    Date.now() - Number(policy.retain_days) * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: rows, error } = await db
    .from("treatment_documents")
    .select("id, file_path")
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff)
    .limit(DOCUMENT_BATCH);

  if (error) {
    console.error("[cron/retention-purge] document query failed:", error);
    outcome.failures += 1;
    return outcome;
  }

  const eligible = (rows ?? []) as { id: string; file_path: string }[];
  outcome.eligible = eligible.length;

  if (dryRun || eligible.length === 0) return outcome;

  const { error: removeErr } = await db.storage
    .from(DOCUMENT_BUCKET)
    .remove(eligible.map((r) => r.file_path));

  if (removeErr) {
    // Do NOT delete the rows. Losing the pointer to a file that is still on
    // disk is exactly the outcome this ordering exists to avoid; the next run
    // retries the same batch.
    console.error("[cron/retention-purge] object removal failed:", removeErr);
    outcome.failures += 1;
    return outcome;
  }

  outcome.objectsRemoved = eligible.length;

  const { error: rowErr } = await db
    .from("treatment_documents")
    .delete()
    .in(
      "id",
      eligible.map((r) => r.id)
    );

  if (rowErr) {
    console.error("[cron/retention-purge] row removal failed:", rowErr);
    outcome.failures += 1;
    return outcome;
  }

  outcome.rowsRemoved = eligible.length;
  return outcome;
}

/** Only POST is allowed: this endpoint has effects. */
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
