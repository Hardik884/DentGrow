import Link from "next/link";
import { cn } from "@/lib/utils";
import { DentGrowLogo } from "@/components/shared/DentGrowLogo";
import { AuthArtwork } from "./AuthArtwork";
import { AuthThemeToggle } from "./AuthThemeToggle";

/**
 * AuthShell — the frame every DentGrow sign-in page renders inside.
 *
 * COMPOSITION
 *   An asymmetric two-column split on large screens: a painted brand canvas on
 *   the left, the form on a clean surface to the right. The canvas is slightly
 *   the wider of the two at xl so the page doesn't read as a symmetrical
 *   half-and-half, which is the look the brief specifically wanted to avoid.
 *
 *   Below `lg` the canvas is dropped entirely rather than stacked. A decorative
 *   panel above a login form on a phone is just something to scroll past, so
 *   the mobile layout is the form, a compact brand lockup, and nothing else.
 *
 * TONES
 *   Three audiences, three panels, one component. Each tone sets a panel
 *   background and an ink colour; the artwork strokes itself in `currentColor`
 *   and follows along. Emerald stays an accent — it paints one column, never
 *   the page.
 *
 *     staff    deep emerald canvas, confident, the clinic's front door
 *     patient  soft mint canvas, calm and reassuring, deliberately not a
 *              dashboard
 *     admin    graphite canvas, understated, no marketing at all
 *
 * Both themes are designed, not derived: each tone declares its own dark-mode
 * values instead of letting a light palette be dimmed into one.
 */

export type AuthTone = "staff" | "patient" | "admin";

type ToneStyle = {
  /** The painted panel. */
  panel: string;
  /** Ink for the panel — also the colour the artwork strokes itself in. */
  ink: string;
  /** Muted ink for supporting copy on the panel. */
  inkMuted: string;
  /** Hairline used for the eyebrow rule and footnote separator. */
  rule: string;
  /** Glow colour handed to the artwork. */
  glow: string;
  /** Wordmark colour on the panel. */
  wordmark: string;
  /**
   * Gradient start for the scrim laid over the artwork.
   *
   * The artwork is drawn edge to edge, so on a short panel (the admin one has
   * no bullet list) the message can land on top of an arch segment. This fades
   * the lower half of the canvas back into the panel colour: the text always
   * sits on flat ground, and the artwork's bottom edge stops reading as a seam.
   */
  scrim: string;
  /** The line under the panel. Different audiences deserve different notes. */
  footnote: string;
};

const TONES: Record<AuthTone, ToneStyle> = {
  staff: {
    panel: "bg-[#0B3B34] dark:bg-[#06201C]",
    ink: "text-white",
    inkMuted: "text-white/70",
    rule: "bg-white/20",
    glow: "#35A18F",
    wordmark: "text-white",
    scrim: "from-[#0B3B34] dark:from-[#06201C]",
    footnote: "Patient data stays inside your clinic.",
  },
  patient: {
    // Light: the soft emerald from the DentGrow ramp, so the patient door feels
    // like an invitation rather than an operations console.
    // Dark: deliberately LIGHTER and less saturated than the staff panel. Both
    // are green in dark mode, and without the separation in value the two doors
    // read as the same screen with different words on it.
    panel: "bg-[#E4F2ED] dark:bg-[#172B26]",
    ink: "text-[#0A3B33] dark:text-[#EAF3F0]",
    inkMuted: "text-[#2F5C54] dark:text-[#AFC4BE]",
    rule: "bg-[#0A3B33]/15 dark:bg-white/20",
    glow: "#0D6B5E",
    wordmark: "text-[#0A3B33] dark:text-[#EAF3F0]",
    scrim: "from-[#E4F2ED] dark:from-[#172B26]",
    footnote: "Your records are private to you and your clinic.",
  },
  admin: {
    panel: "bg-[#14191A] dark:bg-[#0A0D0E]",
    ink: "text-[#E8ECEA]",
    inkMuted: "text-[#8C9793]",
    rule: "bg-white/12",
    glow: "#4A5B57",
    wordmark: "text-[#E8ECEA]",
    scrim: "from-[#14191A] dark:from-[#0A0D0E]",
    footnote: "Access is verified server-side on every request.",
  },
};

interface AuthShellProps {
  tone: AuthTone;
  /** Small label above the headline, e.g. "Clinic sign-in". */
  eyebrow: string;
  /** The one line that carries the panel. Keep it short. */
  headline: string;
  /** One supporting sentence. Optional — the admin panel has none. */
  subhead?: string;
  /** Up to three short reassurance lines under the headline. */
  points?: string[];
  /** Title rendered above the form. */
  formTitle: string;
  /** Sentence under the form title. */
  formSubtitle?: string;
  /** The form itself. */
  children: React.ReactNode;
  /** Links or notes rendered under the form. */
  footer?: React.ReactNode;
}

export function AuthShell({
  tone,
  eyebrow,
  headline,
  subhead,
  points,
  formTitle,
  formSubtitle,
  children,
  footer,
}: AuthShellProps) {
  const t = TONES[tone];

  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-2 xl:grid-cols-[1.08fr_1fr]">
      {/* ── Brand canvas ──────────────────────────────────────────────────── */}
      <aside
        className={cn(
          "relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between",
          "px-12 py-14 xl:px-16",
          t.panel,
          t.ink
        )}
      >
        <AuthArtwork
          glow={t.glow}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-t via-transparent to-transparent",
            t.scrim
          )}
          aria-hidden="true"
        />

        {/* Brand lockup. `mono` rather than the tiled mark: the panel is already
            a painted brand surface, and a second emerald tile on top of it either
            fights the panel (admin, patient-light) or sinks into it (staff). */}
        <div className={cn("relative flex items-center gap-3", t.wordmark)}>
          <DentGrowLogo size={44} variant="mono" />
          <span className="text-[17px] font-semibold tracking-tight">
            DentGrow
          </span>
        </div>

        {/* Message */}
        <div className="relative max-w-md">
          <div className="flex items-center gap-3">
            <span className={cn("h-px w-8", t.rule)} />
            <span
              className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.16em]",
                t.inkMuted
              )}
            >
              {eyebrow}
            </span>
          </div>

          <h2
            className={cn(
              "mt-5 text-[34px] font-semibold leading-[1.15] tracking-[-0.02em] xl:text-[40px]",
              t.ink
            )}
          >
            {headline}
          </h2>

          {subhead && (
            <p className={cn("mt-4 max-w-sm text-[15px] leading-relaxed", t.inkMuted)}>
              {subhead}
            </p>
          )}

          {points && points.length > 0 && (
            <ul className="mt-8 space-y-3">
              {points.map((point) => (
                <li key={point} className="flex items-start gap-3">
                  <CheckMark className={cn("mt-0.5 h-4 w-4 shrink-0", t.inkMuted)} />
                  <span className={cn("text-sm leading-snug", t.inkMuted)}>{point}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className={cn("relative text-xs", t.inkMuted)}>{t.footnote}</p>
      </aside>

      {/* ── Form column ───────────────────────────────────────────────────── */}
      <main className="relative flex min-h-dvh flex-col bg-surface">
        {/* Mobile brand bar + appearance control. The toggle is here rather
            than on the canvas so it exists at every breakpoint. */}
        <div className="flex items-center justify-between gap-4 px-5 pt-5 sm:px-8 lg:px-10">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface lg:invisible"
            aria-label="DentGrow home"
          >
            <DentGrowLogo size={32} withWordmark />
          </Link>

          <AuthThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8 sm:py-12">
          <div className="w-full max-w-[400px]">
            <header className="mb-8">
              <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-text-primary sm:text-[28px]">
                {formTitle}
              </h1>
              {formSubtitle && (
                <p className="mt-2 text-sm leading-relaxed text-text-body">
                  {formSubtitle}
                </p>
              )}
            </header>

            {children}

            {footer && (
              <div className="mt-8 border-t border-border pt-6 text-center text-[13px] text-text-body">
                {footer}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function CheckMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" strokeOpacity="0.45" />
      <path d="m6.6 10.2 2.3 2.3 4.5-4.7" />
    </svg>
  );
}
