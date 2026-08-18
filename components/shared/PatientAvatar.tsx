import { cn } from "@/lib/utils";

interface PatientAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "w-7 h-7 text-xs",
  md: "w-9 h-9 text-sm",
  lg: "w-12 h-12 text-base",
};

// Neutral palette — no bright colors, consistent with the design system
/**
 * Identity palette — a patient always gets the same swatch, derived from their
 * name. Deliberately quiet: these are background chips behind two initials, not
 * status indicators. Each entry pairs a status tint with its own text colour so
 * the pair stays legible in either theme.
 */
const PALETTES = [
  'bg-surface-muted text-text-body',
  'bg-info-bg text-info',
  'bg-success-bg text-success',
  'bg-warning-bg text-warning',
  'bg-danger-bg text-danger',
  'bg-accent-soft text-accent',
  'bg-accent-subtle-bg text-accent-hover',
];

export function PatientAvatar({ name, size = "md", className }: PatientAvatarProps) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  // Deterministic palette selection from name
  const idx =
    name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % PALETTES.length;
  const palette = PALETTES[idx]!;

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-medium shrink-0",
        SIZE_CLASSES[size],
        palette,
        className
      )}
      aria-label={name}
      role="img"
    >
      {initials}
    </div>
  );
}
