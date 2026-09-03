"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { setMyDataConsent } from "@/actions/data-consent";
import { privacyPolicyUrl } from "@/lib/legal/links";
import type { DataConsentState } from "@/lib/data-consent";

/**
 * PrivacyChoices — the patient's data-processing preferences.
 *
 * DESIGN INTENT
 *   This must not feel like a compliance form. It is one card among the others
 *   on the profile page, with the same border, the same padding and the same
 *   type scale as Appearance — because it is a setting, and settings pages are
 *   where people expect to find settings.
 *
 *   Each row is one short sentence and one control. The sentence comes from the
 *   database (the versioned notice), never from this file, so revising the
 *   wording is a new notice version rather than a code deploy — and the
 *   sentence a patient was shown is the sentence frozen onto their decision.
 *
 * WHY ONE ROW HAS NO SWITCH
 *   A clinic cannot treat someone without keeping a record of the treatment, so
 *   "your dental records" is shown with a lock rather than a toggle. Offering a
 *   switch the product could not honour would tell the patient something untrue
 *   about what they control. What they can do instead is stated in the same
 *   place, in plain words.
 *
 * OPTIMISTIC, BUT HONEST
 *   The switch moves immediately and reverts if the write fails, so a slow
 *   connection does not feel broken — but a failure is surfaced as a failure,
 *   not swallowed, because a preference that silently did not save is worse
 *   than one that visibly did not.
 */
export function PrivacyChoices({ initial }: { initial: DataConsentState[] }) {
  const [choices, setChoices] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [busyCategory, setBusyCategory] = useState<string | null>(null);

  function toggle(entry: DataConsentState) {
    const next = entry.decision === "granted" ? "withdrawn" : "granted";

    // Optimistic. Kept in a local copy so the revert below is exact.
    const before = choices;
    setChoices((current) =>
      current.map((c) =>
        c.category === entry.category ? { ...c, decision: next, recorded: true } : c
      )
    );
    setBusyCategory(entry.category);

    startTransition(async () => {
      const result = await setMyDataConsent({
        category: entry.category,
        decision: next,
      });
      setBusyCategory(null);

      if (result.error || !result.data) {
        setChoices(before);
        toast.error(result.error ?? "Could not save that choice.");
        return;
      }

      // Trust the server's view over the optimistic one — it is the ledger.
      setChoices(result.data);
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-xs">
      <h2 className="text-sm font-semibold text-text-primary">Privacy choices</h2>
      <p className="mt-0.5 text-xs text-text-secondary">
        What your clinic may do with your information. You can change these at
        any time, and turning something off never affects your treatment.
      </p>

      <ul className="mt-4 divide-y divide-border">
        {choices.map((entry) => (
          <li
            key={entry.category}
            className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">{entry.label}</p>
              {entry.notice?.summary && (
                <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
                  {entry.notice.summary}
                </p>
              )}
              {!entry.withdrawable && (
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                  Your clinic has to keep this. To ask about your records, speak
                  to your clinic.
                </p>
              )}
            </div>

            {entry.withdrawable ? (
              <ConsentSwitch
                label={entry.label}
                on={entry.decision === "granted"}
                busy={pending && busyCategory === entry.category}
                onToggle={() => toggle(entry)}
              />
            ) : (
              <span
                className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-text-secondary"
                // The lock is decorative; the word carries the meaning, so the
                // state is never communicated by an icon alone.
              >
                <Lock className="h-3 w-3" aria-hidden="true" />
                Always on
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-text-secondary">
        Full details are in our{" "}
        <a
          href={privacyPolicyUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Privacy Policy
        </a>
        .
      </p>
    </section>
  );
}

/**
 * A switch built on a real <button role="switch">, so it is reachable by
 * keyboard and announced with its state. The checkmark inside the knob means
 * the "on" state is not carried by colour and position alone.
 */
function ConsentSwitch({
  label,
  on,
  busy,
  onToggle,
}: {
  label: string;
  on: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onToggle}
      className={cn(
        "relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full",
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "disabled:cursor-wait disabled:opacity-60",
        on ? "bg-accent" : "bg-border"
      )}
    >
      <span
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface shadow-xs",
          "transition-transform duration-150",
          on ? "translate-x-[22px]" : "translate-x-0.5"
        )}
      >
        {on && <Check className="h-3 w-3 text-accent" aria-hidden="true" />}
      </span>
    </button>
  );
}
