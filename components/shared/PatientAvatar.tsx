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
const PALETTES = [
  "bg-[#F4F4F5] text-[#52525B]",
  "bg-[#EFF6FF] text-[#2563EB]",
  "bg-[#F0FDF4] text-[#16A34A]",
  "bg-[#FEFCE8] text-[#A16207]",
  "bg-[#FEF2F2] text-[#B91C1C]",
  "bg-[#F5F3FF] text-[#6D28D9]",
  "bg-[#FFF7ED] text-[#C2410C]",
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
