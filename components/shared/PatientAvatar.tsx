import { cn } from "@/lib/utils";

interface PatientAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-base",
};

/**
 * PatientAvatar
 *
 * Initials-based avatar for patients.
 * No photo upload in MVP — initials from name only.
 */
export function PatientAvatar({ name, size = "md", className }: PatientAvatarProps) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  // Deterministic colour from name (hash → hue)
  const hue = name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-medium text-white shrink-0",
        SIZE_CLASSES[size],
        className
      )}
      style={{ backgroundColor: `hsl(${hue}, 50%, 45%)` }}
      aria-label={name}
    >
      {initials}
    </div>
  );
}
