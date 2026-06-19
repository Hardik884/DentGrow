"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/shared/SignOutButton";

interface NavItem {
  label: string;
  href: string;
  icon?: string; // Lucide icon name — resolved at render time
}

const DENTIST_NAV: NavItem[] = [
  { label: "Dashboard",    href: "/dentist" },
  { label: "Patients",     href: "/dentist/patients" },
  { label: "Appointments", href: "/dentist/appointments" },
  { label: "Queue",        href: "/dentist/queue" },
  { label: "Treatments",   href: "/dentist/treatments" },
  { label: "Payments",     href: "/dentist/payments" },
  { label: "Follow-Ups",   href: "/dentist/follow-ups" },
  { label: "Analytics",    href: "/dentist/analytics" },
  { label: "Settings",     href: "/dentist/settings" },
];

const RECEPTIONIST_NAV: NavItem[] = [
  { label: "Dashboard",    href: "/receptionist" },
  { label: "Patients",     href: "/receptionist/patients" },
  { label: "Appointments", href: "/receptionist/appointments" },
  { label: "Queue",        href: "/receptionist/queue" },
  { label: "Payments",     href: "/receptionist/payments" },
];

interface DashboardSidebarProps {
  role: "dentist" | "receptionist" | "patient";
  fullName: string;
}

/**
 * DashboardSidebar
 *
 * Role-aware navigation sidebar for staff dashboards.
 * Renders dentist nav items for dentist role, receptionist nav for receptionist.
 * Active link detection via usePathname.
 */
export function DashboardSidebar({ role, fullName }: DashboardSidebarProps) {
  const pathname = usePathname();
  const navItems = role === "dentist" ? DENTIST_NAV : RECEPTIONIST_NAV;

  return (
    <aside className="w-60 shrink-0 h-screen bg-white border-r flex flex-col">
      {/* Logo / brand */}
      <div className="p-4 border-b">
        <span className="text-xl font-bold text-blue-600">DentGrow</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
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
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User info + sign out */}
      <div className="p-4 border-t text-sm text-gray-600">
        <p className="font-medium truncate">{fullName}</p>
        <p className="text-xs text-gray-400 capitalize mb-3">{role}</p>
        <SignOutButton className="w-full text-left" />
      </div>
    </aside>
  );
}
