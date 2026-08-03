/**
 * Specs for the middleware matcher.
 *
 * These exist because of a silent production failure. The matcher covered every
 * path except static assets, and updateSession redirects any unauthenticated
 * request to /login — so pg_cron calling /api/cron/* through pg_net received a
 * 307 to an HTML login page. The request never reached the route handler, both
 * scheduled jobs did nothing, and nothing anywhere reported an error: a
 * redirect looks like a successful response to the caller, and pg_net records
 * the 307 as a completed request.
 *
 * The failure is invisible by construction, which is exactly why it is worth a
 * test. Asserting on the regex is unusually literal, but the matcher is a
 * string in a config object that no type checker will ever look at, and getting
 * it wrong costs nothing at build time and everything at run time.
 */

import { describe, expect, it } from "vitest";

import { config } from "@/middleware";

/** Next compiles each matcher entry as a full-path regex. */
const matchers = config.matcher.map((m) => new RegExp(`^${m}$`));
const isMatched = (pathname: string) => matchers.some((re) => re.test(pathname));

describe("middleware matcher", () => {
  it("does NOT run on the cron endpoints", () => {
    // The regression: these were matched, so pg_net got a login redirect.
    expect(isMatched("/api/cron/no-show-detection")).toBe(false);
    expect(isMatched("/api/cron/metric-history")).toBe(false);
  });

  it("does NOT run on the n8n webhook", () => {
    expect(isMatched("/api/webhooks/n8n")).toBe(false);
  });

  it("does not run on any /api route, including ones added later", () => {
    expect(isMatched("/api")).toBe(false);
    expect(isMatched("/api/anything/at/all")).toBe(false);
  });

  it("STILL guards the pages it is there to guard", () => {
    // The other half of the fix: excluding /api must not punch a hole in the
    // role gate, which is the middleware's actual job.
    for (const path of [
      "/",
      "/login",
      "/dentist",
      "/dentist/patients",
      "/dentist/business-brain",
      "/receptionist",
      "/receptionist/payments",
      "/portal",
      "/portal/setup",
    ]) {
      expect(isMatched(path), `${path} must stay behind the middleware`).toBe(true);
    }
  });

  it("skips static assets and image files", () => {
    expect(isMatched("/_next/static/chunk.js")).toBe(false);
    expect(isMatched("/_next/image")).toBe(false);
    expect(isMatched("/favicon.ico")).toBe(false);
    expect(isMatched("/logo.svg")).toBe(false);
    expect(isMatched("/photo.jpg")).toBe(false);
  });
});
