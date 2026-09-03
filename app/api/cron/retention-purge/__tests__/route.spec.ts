/**
 * Specs for the retention-purge cron endpoint.
 *
 * This endpoint DELETES, and it is reachable over the network. That makes two
 * properties matter more than anything else it does, and both run without a
 * database:
 *
 *   1. it refuses to run unauthenticated, and refuses to run at all when no
 *      secret is configured — an unset secret must never read as "open";
 *   2. it is a DRY RUN unless a request explicitly says otherwise. A malformed
 *      body, an empty body, a `true`, a string, a missing field — every one of
 *      those must count rather than delete, because a delete endpoint that
 *      defaults to deleting eventually deletes something because a request was
 *      shaped slightly wrong.
 *
 * Mirrors app/api/cron/no-show-detection/__tests__/route.spec.ts.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const URL_BASE = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:55321";
const SERVICE_KEY =
  process.env.SUPABASE_TEST_SERVICE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

process.env.NEXT_PUBLIC_SUPABASE_URL = URL_BASE;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;

const SECRET = "test-cron-secret-value";

/** Records what the route asked the database to do, without a database. */
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { data: { dry_run: args.p_dry_run, policies: [] }, error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          // No document policy configured in this stub, so the document sweep
          // returns early and the assertions stay about dry-run semantics.
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

const { POST, GET } = await import("../route");

function post(body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/retention-purge", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const authorized = { authorization: `Bearer ${SECRET}` };

afterEach(() => {
  rpcCalls.length = 0;
  delete process.env.CRON_SECRET;
});

describe("auth", () => {
  it("REFUSES to run when CRON_SECRET is unset, rather than running open", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(post({ dryRun: false }, authorized) as never);
    expect(res.status).toBe(503);
    expect(rpcCalls).toHaveLength(0);
  });

  it("rejects a missing token", async () => {
    process.env.CRON_SECRET = SECRET;
    const res = await POST(post({}) as never);
    expect(res.status).toBe(401);
    expect(rpcCalls).toHaveLength(0);
  });

  it("rejects a wrong token", async () => {
    process.env.CRON_SECRET = SECRET;
    const res = await POST(post({}, { authorization: "Bearer nope" }) as never);
    expect(res.status).toBe(401);
    expect(rpcCalls).toHaveLength(0);
  });

  it("rejects a token without the Bearer scheme", async () => {
    process.env.CRON_SECRET = SECRET;
    const res = await POST(post({}, { authorization: SECRET }) as never);
    expect(res.status).toBe(401);
  });

  it("refuses GET — this endpoint has effects", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });
});

describe("dry run is the default", () => {
  const cases: Array<[string, unknown]> = [
    ["an empty body", undefined],
    ["an empty object", {}],
    ["dryRun omitted", { somethingElse: 1 }],
    ["dryRun: true", { dryRun: true }],
    ["dryRun as the STRING 'false'", { dryRun: "false" }],
    ["dryRun: null", { dryRun: null }],
    ["dryRun: 0", { dryRun: 0 }],
  ];

  for (const [label, body] of cases) {
    it(`counts rather than deletes for ${label}`, async () => {
      process.env.CRON_SECRET = SECRET;
      const res = await POST(post(body, authorized) as never);

      expect(res.status).toBe(200);
      expect(rpcCalls).toHaveLength(1);
      expect(rpcCalls[0].fn).toBe("run_retention_purge");
      // The one thing that must never be false by accident.
      expect(rpcCalls[0].args.p_dry_run).toBe(true);

      const payload = await res.json();
      expect(payload.dryRun).toBe(true);
    });
  }

  it("counts rather than deletes for a body that is not JSON at all", async () => {
    process.env.CRON_SECRET = SECRET;
    const res = await POST(
      new Request("http://localhost/api/cron/retention-purge", {
        method: "POST",
        headers: { "content-type": "application/json", ...authorized },
        body: "{not json",
      }) as never
    );

    expect(res.status).toBe(200);
    expect(rpcCalls[0].args.p_dry_run).toBe(true);
  });
});

describe("deleting requires saying so", () => {
  it("purges only for an explicit boolean false", async () => {
    process.env.CRON_SECRET = SECRET;
    const res = await POST(post({ dryRun: false }, authorized) as never);

    expect(res.status).toBe(200);
    expect(rpcCalls[0].args.p_dry_run).toBe(false);

    const payload = await res.json();
    expect(payload.dryRun).toBe(false);
  });
});
