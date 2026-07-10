"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/shared/SignOutButton";
import { DentGrowLogo } from "@/components/shared/DentGrowLogo";
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
  { label: "Payments",          href: "/dentist/payments",     icon: CreditCard },
  { label: "External Consultations", href: "/dentist/external-consultations", icon: Briefcase },
  { label: "Treatments",        href: "/dentist/treatments",   icon: Stethoscope },
  { label: "Follow-up Appointments", href: "/dentist/follow-ups", icon: Bell },
  { label: "Analytics",         href: "/dentist/analytics",    icon: BarChart3 },
  { label: "Settings",          href: "/dentist/settings",     icon: Settings },
];

// Base receptionist nav (always shown)
const BASE_RECEPTIONIST_NAV: NavItem[] = [
  { label: "Today's Dashboard", href: "/receptionist",              icon: LayoutDashboard },
  { label: "Patients",          href: "/receptionist/patients",     icon: Users },
  { label: "Appointments",      href: "/receptionist/appointments", icon: CalendarDays },
  { label: "Prescription History", href: "/receptionist/prescriptions", icon: Pill },
];

// Conditional payment nav item (shown only when allowed)
const PAYMENTS_NAV_ITEM: NavItem = {
  label: "Payments",
  href: "/receptionist/payments",
  icon: CreditCard,
};

interface DashboardSidebarProps {
  role: "dentist" | "receptionist" | "patient";
  fullName: string;
  allowReceptionistPayments?: boolean;
}

export function DashboardSidebar({ role, fullName, allowReceptionistPayments = false }: DashboardSidebarProps) {
  const pathname = usePathname();
  
  // Build receptionist nav dynamically based on payment access
  const receptionistNav = allowReceptionistPayments
    ? [...BASE_RECEPTIONIST_NAV, PAYMENTS_NAV_ITEM]
    : BASE_RECEPTIONIST_NAV;

  const navItems = role === "dentist" ? DENTIST_NAV : receptionistNav;

  // Initials for avatar
  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <aside className="w-56 shrink-0 h-screen bg-white border-r border-[#E4E4E7] flex flex-col">
      {/* Brand */}
      <div className="h-14 flex items-center px-5 border-b border-[#E4E4E7] shrink-0">
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
                "sidebar-nav-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm",
                isActive
                  ? "bg-[#F4F4F5] text-[#09090B] font-medium"
                  : "text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#09090B] font-normal"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <item.icon
                className={cn("h-4 w-4 shrink-0", isActive ? "text-[#09090B]" : "text-[#A1A1AA]")}
                aria-hidden
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-[#E4E4E7] shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-1.5 mb-2">
          <div className="h-7 w-7 rounded-full bg-[#F4F4F5] flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-[#71717A]">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[#09090B] truncate">{fullName}</p>
            <p className="text-xs text-[#A1A1AA] capitalize">{role}</p>
          </div>
        </div>
        <SignOutButton className="w-full" />
      </div>
    </aside>
  );
}
