"use client";

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

  return (
    <aside className="w-56 shrink-0 h-screen bg-surface border-r border-border flex flex-col">
      {/* Brand */}
      <div className="h-14 flex items-center px-5 border-b border-border shrink-0">
        <DentGrowLogo size={28} withWordmark />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5" aria-label="Main navigation">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dentist" || item.href === "/receptionist"
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "sidebar-nav-item relative flex items-center gap-2.5 pl-3.5 pr-3 py-2 rounded-lg text-sm",
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
        })}
      </nav>

      {/* User footer */}
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
    </aside>
  );
}
