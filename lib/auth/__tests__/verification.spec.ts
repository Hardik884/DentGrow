/**
 * How a failed verification email is explained to the person waiting for it.
 *
 * This matters more than usual right now: the hosted project runs on Supabase's
 * built-in email service, which refuses any recipient that is not on the
 * project's team and allows two messages an hour. Both failures are ordinary
 * there, and the difference between them is the difference between "wait" and
 * "this will never work" — so getting the classification wrong sends someone
 * round a loop that cannot end.
 */

import { describe, expect, it } from "vitest";

import { describeEmailSendFailure, RESEND_COOLDOWN_SECONDS } from "../verification";

describe("describeEmailSendFailure", () => {
  describe("throttling", () => {
    it("reads back the wait Supabase named", () => {
      const failure = describeEmailSendFailure(
        "For security purposes, you can only request this after 47 seconds."
      );

      expect(failure.kind).toBe("throttled");
      expect(failure.retryAfterSeconds).toBe(47);
      expect(failure.message).toContain("47 seconds");
    });

    it("rounds a long wait into minutes rather than reciting seconds", () => {
      // The built-in service's 2/hour cap produces waits of this size, and
      // "please try again in 1794 seconds" is not something a person can use.
      const failure = describeEmailSendFailure(
        "For security purposes, you can only request this after 1794 seconds."
      );

      expect(failure.kind).toBe("throttled");
      expect(failure.message).toContain("30 minutes");
      expect(failure.message).not.toContain("1794");
    });

    it("says 'a minute', not '1 minutes'", () => {
      const failure = describeEmailSendFailure(
        "For security purposes, you can only request this after 60 seconds."
      );
      expect(failure.message).toContain("a minute");
      expect(failure.message).not.toContain("1 minutes");
    });

    it("rounds the wait up, never down", () => {
      // Under-quoting sends the patient back to a button that refuses them
      // again — the exact experience the classification exists to prevent.
      const failure = describeEmailSendFailure(
        "For security purposes, you can only request this after 61 seconds."
      );
      expect(failure.message).toContain("2 minutes");
    });

    it("still classifies a throttle that names no number", () => {
      const failure = describeEmailSendFailure("email rate limit exceeded");

      expect(failure.kind).toBe("throttled");
      expect(failure.retryAfterSeconds).toBeNull();
      expect(failure.message).toContain("wait a little while");
    });

    it.each([
      "over_email_send_rate_limit",
      "Too many requests",
      "Email rate limit exceeded",
    ])("recognises %s", (raw) => {
      expect(describeEmailSendFailure(raw).kind).toBe("throttled");
    });
  });

  describe("a recipient the transport will not carry", () => {
    it.each([
      "Email address not authorized",
      "email_address_not_authorized",
      "Error sending confirmation email: email address not authorized",
    ])("recognises %s", (raw) => {
      const failure = describeEmailSendFailure(raw);
      expect(failure.kind).toBe("not_authorized");
      expect(failure.retryAfterSeconds).toBeNull();
    });

    it("never tells the patient to try again, because waiting cannot fix it", () => {
      const failure = describeEmailSendFailure("Email address not authorized");
      expect(failure.message).not.toMatch(/try again|wait/i);
      // It points at the one route that does work: a human at the clinic.
      expect(failure.message).toMatch(/contact your clinic/i);
    });

    it("wins over the throttle branch when a message could match both", () => {
      // Ordering matters: this is not a wait, and offering one would be a loop.
      const failure = describeEmailSendFailure(
        "Email address not authorized; rate limit also applies"
      );
      expect(failure.kind).toBe("not_authorized");
    });
  });

  describe("everything else", () => {
    it.each([
      ["an unrelated failure", "connection refused"],
      ["an empty message", ""],
      ["undefined", undefined],
    ])("falls back to a transient explanation for %s", (_label, raw) => {
      const failure = describeEmailSendFailure(raw);
      expect(failure.kind).toBe("unknown");
      expect(failure.message).toContain("try again shortly");
    });
  });

  it("never leaks raw provider or Supabase wording to the screen", () => {
    const raws = [
      "For security purposes, you can only request this after 47 seconds.",
      "Email address not authorized",
      "over_email_send_rate_limit",
      "535 5.7.8 Error: authentication failed: smtp.resend.com",
      "connection refused",
    ];

    for (const raw of raws) {
      const { message } = describeEmailSendFailure(raw);
      expect(message.toLowerCase()).not.toContain("supabase");
      expect(message.toLowerCase()).not.toContain("smtp");
      expect(message.toLowerCase()).not.toContain("resend.com");
      expect(message).not.toContain("_");            // no snake_case error codes
      expect(message).not.toMatch(/\b5\d{2}\b/);     // no SMTP status codes
    }
  });
});

describe("RESEND_COOLDOWN_SECONDS", () => {
  it("is a real number, not a client reference", () => {
    // Guards the RSC trap this constant was moved out of the client component
    // to avoid: arithmetic on a client reference yields NaN silently.
    expect(typeof RESEND_COOLDOWN_SECONDS).toBe("number");
    expect(Number.isFinite(RESEND_COOLDOWN_SECONDS)).toBe(true);
  });
});
