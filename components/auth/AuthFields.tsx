"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Shared building blocks for the three sign-in forms.
 *
 * They exist so staff, patient and admin sign-in are the same product rather
 * than three forms that happen to look alike, and so the accessibility details
 * — a real <label for>, a described error, a labelled visibility toggle, a
 * 44px touch target — are written once instead of three times.
 */

// ── Labelled text field ───────────────────────────────────────────────────────

interface AuthFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Rendered at the right of the label row, e.g. a "Forgot password?" link. */
  action?: React.ReactNode;
  hint?: string;
}

export function AuthField({
  label,
  action,
  hint,
  id,
  className,
  ...props
}: AuthFieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = hint ? `${fieldId}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={fieldId}
          className="text-[13px] font-medium text-text-strong"
        >
          {label}
        </label>
        {action}
      </div>
      <Input
        id={fieldId}
        aria-describedby={hintId}
        className={cn("h-11 rounded-[10px] text-[15px]", className)}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-xs text-text-body">
          {hint}
        </p>
      )}
    </div>
  );
}

// ── Password field with a visibility toggle ───────────────────────────────────

interface PasswordFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  action?: React.ReactNode;
  hint?: string;
}

export function PasswordField({
  label,
  action,
  hint,
  id,
  ...props
}: PasswordFieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={fieldId}
          className="text-[13px] font-medium text-text-strong"
        >
          {label}
        </label>
        {action}
      </div>

      <div className="relative">
        <Input
          id={fieldId}
          type={visible ? "text" : "password"}
          aria-describedby={hintId}
          // Room for the toggle, so a long password never runs under it.
          className="h-11 rounded-[10px] pr-12 text-[15px]"
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // The toggle must never submit the form or steal the submit's focus
          // ring, and it must not be reachable while the form is disabled.
          disabled={props.disabled}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className={cn(
            "absolute inset-y-0 right-0 flex w-11 items-center justify-center",
            "rounded-r-[10px] text-text-body transition-colors duration-150",
            "hover:text-text-primary cursor-pointer",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {hint && (
        <p id={hintId} className="text-xs text-text-body">
          {hint}
        </p>
      )}
    </div>
  );
}

// ── Banners ───────────────────────────────────────────────────────────────────

/**
 * AuthAlert — the error line above a sign-in form.
 *
 * role="alert" so a screen reader announces a failed sign-in immediately; the
 * icon means the failure is not signalled by colour alone.
 */
export function AuthAlert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-[10px] border border-danger-border bg-danger-bg px-3.5 py-3 text-[13px] leading-snug text-danger"
    >
      <svg
        className="mt-px h-4 w-4 shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          clipRule="evenodd"
        />
      </svg>
      {children}
    </div>
  );
}

/** AuthNotice — the success line, e.g. after a completed password reset. */
export function AuthNotice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-[10px] border border-success-border bg-success-bg px-3.5 py-3 text-[13px] leading-snug text-success"
    >
      <svg
        className="mt-px h-4 w-4 shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.5 7.555a1 1 0 0 1-1.42.001L3.29 10.36a1 1 0 1 1 1.42-1.41l3.29 3.31 6.79-6.84a1 1 0 0 1 1.414-.13Z"
          clipRule="evenodd"
        />
      </svg>
      {children}
    </div>
  );
}

// ── Submit ────────────────────────────────────────────────────────────────────

/**
 * AuthSubmit — the primary action.
 *
 * `isPending` comes from useActionState, which flips it in the same tick the
 * form is submitted. So the label changes to "Signing in…" and the spinner
 * appears immediately on click, and the disabled state makes a second
 * submission impossible while the first is in flight — no double bookings of a
 * sign-in, and no wondering whether the button registered.
 */
export function AuthSubmit({
  isPending,
  idleLabel,
  pendingLabel,
  disabled,
}: {
  isPending: boolean;
  idleLabel: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  return (
    <Button
      type="submit"
      size="lg"
      isLoading={isPending}
      disabled={disabled || isPending}
      className="h-11 w-full rounded-[10px] text-[15px]"
    >
      {isPending ? pendingLabel : idleLabel}
    </Button>
  );
}

// ── Inline link ───────────────────────────────────────────────────────────────

export function AuthLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "rounded font-medium text-accent underline-offset-4 transition-colors duration-150",
        "hover:text-accent-hover hover:underline",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        className
      )}
    >
      {children}
    </a>
  );
}
