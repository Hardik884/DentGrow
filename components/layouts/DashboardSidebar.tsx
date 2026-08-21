"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/shared/SignOutButton";
import { DentGrowLogo } from "@/components/shared/DentGrowLogo";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ListOrdered,
  Stethoscope,
  Bell,
  BarChart3,
  Settings,
  CreditCard,
  Pill,
  Briefcase,
  BrainCircuit,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const DENTIST_NAV: NavItem[] = [
  { label: "Today's Dashboard", href: "/dentist",              icon: LayoutDashboard },
  { label: "Patients",          href: "/dentist/patients",     icon: Users },
  { label: "Appointments",      href: "/dentist/appointments", icon: CalendarDays },
  { label: "Queue",             href: "/dentist/queue",        icon: ListOrdered },
  { label: "Billing & Payments", href: "/dentist/payments",    icon: CreditCard },
  { label: "External Consultations", href: "/dentist/external-consultations", icon: Briefcase },
  { label: "Treatments",        href: "/dentist/treatments",   icon: Stethoscope },
  { label: "Follow-up Appointments", href: "/dentist/follow-ups", icon: Bell },
  { label: "Analytics",         href: "/dentist/analytics",    icon: BarChart3 },
  { label: "Settings",          href: "/dentist/settings",     icon: Settings },
];

/**
 * Shown only for clinics on the Business Brain allow-list. Inserted just above
 * Analytics — the "what to do" surface sits right before the "how are we doing"
 * one.
 */
const BUSINESS_BRAIN_NAV_ITEM: NavItem = {
  label: "Actions",
  href: "/dentist/business-brain",
  icon: BrainCircuit,
};

// Base receptionist nav (always shown)
const BASE_RECEPTIONIST_NAV: NavItem[] = [
  { label: "Today's Dashboard", href: "/receptionist",              icon: LayoutDashboard },
  { label: "Patients",          href: "/receptionist/patients",     icon: Users },
  { label: "Appointments",      href: "/receptionist/appointments", icon: CalendarDays },
  { label: "Prescription History", href: "/receptionist/prescriptions", icon: Pill },
];

// Conditional payment nav item (shown only when allowed)
const PAYMENTS_NAV_ITEM: NavItem = {
  label: "Billing & Payments",
  href: "/receptionist/payments",
  icon: CreditCard,
};

interface DashboardSidebarProps {
  role: "dentist" | "receptionist" | "patient";
  fullName: string;
  allowReceptionistPayments?: boolean;
  /** Business Brain is allow-listed per clinic; resolved server-side. */
  showBusinessBrain?: boolean;
}

export function DashboardSidebar({
  role,
  fullName,
  allowReceptionistPayments = false,
  showBusinessBrain = false,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Build receptionist nav dynamically based on payment access
  const receptionistNav = allowReceptionistPayments
    ? [...BASE_RECEPTIONIST_NAV, PAYMENTS_NAV_ITEM]
    : BASE_RECEPTIONIST_NAV;

  const dentistNav = showBusinessBrain
    ? (() => {
        // Insert "Actions" immediately above Analytics.
        const analyticsIndex = DENTIST_NAV.findIndex((i) => i.href === "/dentist/analytics");
        const at = analyticsIndex === -1 ? DENTIST_NAV.length - 1 : analyticsIndex;
        return [...DENTIST_NAV.slice(0, at), BUSINESS_BRAIN_NAV_ITEM, ...DENTIST_NAV.slice(at)];
      })()
    : DENTIST_NAV;

  const navItems = role === "dentist" ? dentistNav : receptionistNav;

  // Initials for avatar
  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Close the mobile drawer on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile drawer is open, and let Escape close it.
  useEffect(() => {
    if (!mobileOpen) return;
    document.body.style.overflow = "hidden";
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKey);
    };
  }, [mobileOpen]);

  function renderNavLinks(onNavigate?: () => void) {
    return navItems.map((item) => {
      const isActive =
        item.href === "/dentist" || item.href === "/receptionist"
          ? pathname === item.href
          : pathname.startsWith(item.href);

      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={cn(
            "sidebar-nav-item relative flex items-center gap-2.5 pl-3.5 pr-3 py-2.5 md:py-2 rounded-lg text-sm",
            isActive
              ? "bg-accent-soft text-accent-hover font-medium"
              : "text-text-secondary hover:bg-surface-muted hover:text-text-primary font-normal"
          )}
          aria-current={isActive ? "page" : undefined}
        >
          {isActive && (
            <span
              className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-accent"
              aria-hidden
            />
          )}
          <item.icon
            className={cn("h-4 w-4 shrink-0", isActive ? "text-accent" : "text-text-disabled")}
            aria-hidden
          />
          {item.label}
        </Link>
      );
    });
  }

  const userFooter = (
    <div className="p-3 border-t border-border shrink-0">
      <div className="flex items-center gap-2.5 px-2 py-1.5 mb-2">
        <div className="h-7 w-7 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-accent-hover">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text-primary truncate">{fullName}</p>
          <p className="text-xs text-text-disabled capitalize">{role}</p>
        </div>
      </div>
      {/* Appearance lives here so every role can reach it — the receptionist
          has no Settings page of its own. Nav items, routes and labels above
          are untouched. */}
      <ThemeToggle compact className="mb-2" />
      <SignOutButton className="w-full" />
    </div>
  );

  return (
    <>
      {/* ── Desktop sidebar (md and up) — unchanged from the original
          always-visible layout, just gated behind `hidden md:flex` so it
          no longer renders (and can't crush content) on narrow viewports. */}
      <aside className="hidden md:flex w-56 shrink-0 h-screen bg-surface border-r border-border flex-col">
        <div className="h-14 flex items-center px-5 border-b border-border shrink-0">
          <DentGrowLogo size={24} withWordmark />
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5" aria-label="Main navigation">
          {renderNavLinks()}
        </nav>
        {userFooter}
      </aside>

      {/* ── Mobile top bar (below md) — fixed, always visible, hosts the
          hamburger trigger for the off-canvas drawer below. */}
      <header
        className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-surface border-b border-border flex items-center justify-between px-3 gap-2"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-drawer"
          className="h-11 w-11 -ml-1.5 flex items-center justify-center rounded-lg text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors cursor-pointer shrink-0"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <div className="flex-1 min-w-0 flex justify-center">
          <DentGrowLogo size={24} withWordmark />
        </div>
        {/* Balances the hamburger button so the logo stays visually centered. */}
        <div className="h-11 w-11 shrink-0" aria-hidden />
      </header>

      {/* ── Mobile off-canvas drawer — same nav items/order/routes as desktop,
          presented as a slide-in panel instead of an always-visible column. */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-50",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!mobileOpen}
      >
        {/* Backdrop */}
        <div
          className={cn(
            "absolute inset-0 bg-scrim/45 backdrop-blur-[1px] transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setMobileOpen(false)}
        />

        {/* Panel
            Position is driven by an inline `transform: translateX()` rather
            than Tailwind's `translate-x-*` utilities (which target the newer
            standalone CSS `translate` property). Some engines pair that
            property unreliably with a declared transition — the value can get
            stuck mid-transition and never resolve to the new class's target.
            The classic `transform` property doesn't have that failure mode. */}
        <div
          id="mobile-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Main navigation"
          className="absolute inset-y-0 left-0 w-[80vw] max-w-72 bg-surface border-r border-border flex flex-col shadow-xl transition-transform duration-200 ease-out"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
          }}
        >
          <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
            <DentGrowLogo size={24} withWordmark />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation menu"
              className="h-11 w-11 -mr-1.5 flex items-center justify-center rounded-lg text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5" aria-label="Main navigation (mobile)">
            {renderNavLinks(() => setMobileOpen(false))}
          </nav>
          {userFooter}
        </div>
      </div>
    </>
  );
}
