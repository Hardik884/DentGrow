"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/shared/SignOutButton";
import { signOut } from "@/actions/auth";
import { DentGrowLogo } from "@/components/shared/DentGrowLogo";
import {
  LayoutDashboard,
  CalendarDays,
  ListOrdered,
  Stethoscope,
  Pill,
  CreditCard,
  Bell,
  User,
  FileSignature,
  LogOut,
  type LucideIcon,
} from "lucide-react";

interface PortalNavProps {
  patientId: string | null;
  /** Patient Consent Forms is a per-clinic pilot rollout — when false, the
   *  "Consents" item is omitted from the rendered nav entirely (it sits past
   *  the mobile bottom bar's first-5 window regardless, so this only affects
   *  desktop). Defaults false so an omitted prop never accidentally reveals it. */
  consentFormsEnabled?: boolean;
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Order matters: the mobile bottom bar shows only NAV_ITEMS.slice(0, 5)
// (see below), so the first five entries are the mobile tab set. Anything
// added after index 4 reaches the full desktop/menu nav only — that is
// deliberately where Prescriptions sits (audit B9: available through the
// full portal navigation, never displacing an existing mobile tab).
// Exported so navigation-composition specs can pin this without a React
// rendering harness, which this project doesn't otherwise use.
export const NAV_ITEMS: NavItem[] = [
  { label: "Home",         href: "/portal",              icon: LayoutDashboard },
  { label: "Appointments", href: "/portal/appointments", icon: CalendarDays },
  { label: "Queue",        href: "/portal/queue",        icon: ListOrdered },
  { label: "Treatments",   href: "/portal/treatments",   icon: Stethoscope },
  { label: "Billing",      href: "/portal/billing",      icon: CreditCard },
  { label: "Prescriptions", href: "/portal/prescriptions", icon: Pill },
  { label: "Follow-Ups",   href: "/portal/follow-ups",   icon: Bell },
  { label: "Consents",     href: "/portal/consents",     icon: FileSignature },
  { label: "Profile",      href: "/portal/profile",      icon: User },
];

export function PortalNav({ patientId, consentFormsEnabled = false }: PortalNavProps) {
  const pathname = usePathname();
  const [isSigningOut, startSignOutTransition] = useTransition();

  if (!patientId) return null;

  function handleSignOut() {
    startSignOutTransition(async () => {
      await signOut();
    });
  }

  // Filtered per-render, never mutating the exported NAV_ITEMS constant (kept
  // stable for the nav-composition regression spec).
  const visibleNavItems = consentFormsEnabled
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => item.label !== "Consents");

  return (
    <header className="bg-surface border-b border-border sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Brand */}
          <DentGrowLogo size={24} withWordmark />

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1" aria-label="Portal navigation">
            {visibleNavItems.map((item) => {
              const isActive =
                item.href === "/portal"
                  ? pathname === item.href
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150",
                    isActive
                      ? "bg-accent-soft text-accent-hover"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-muted"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden sm:block">
            <SignOutButton />
          </div>
        </div>
      </div>

      {/* Mobile bottom tab bar
          z-30 — above page content, below the chat panel (z-40).
          The chat button uses bottom-[4.5rem] to sit above this bar.
          Show only the first 5 nav items on mobile to prevent crowding.
      */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border flex z-30"
        aria-label="Mobile portal navigation"
      >
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const isActive =
            item.href === "/portal"
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-1.5 px-1 text-[9px] font-medium transition-colors duration-150",
                isActive ? "text-accent" : "text-text-disabled"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <span
                className={cn(
                  "flex items-center justify-center h-6 w-9 rounded-full transition-colors",
                  isActive && "bg-accent-tint"
                )}
              >
                <item.icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="leading-none mt-0.5">{item.label}</span>
            </Link>
          );
        })}

        {/* Sign out — mobile has no other way to reach this (desktop-only
            SignOutButton above lives in the "hidden sm:block" nav), so it
            gets its own tab in the same style as the nav items. */}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          aria-label="Sign out"
          className="flex-1 flex flex-col items-center gap-0.5 py-1.5 px-1 text-[9px] font-medium text-text-disabled transition-colors duration-150 disabled:opacity-50 cursor-pointer"
        >
          <span className="flex items-center justify-center h-6 w-9 rounded-full">
            <LogOut className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <span className="leading-none mt-0.5">
            {isSigningOut ? "Signing out…" : "Sign out"}
          </span>
        </button>
      </nav>
    </header>
  );
}
