"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/shared/SignOutButton";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ListOrdered,
  Stethoscope,
  CreditCard,
  Bell,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const DENTIST_NAV: NavItem[] = [
  { label: "Dashboard",    href: "/dentist",              icon: LayoutDashboard },
  { label: "Patients",     href: "/dentist/patients",     icon: Users },
  { label: "Appointments", href: "/dentist/appointments", icon: CalendarDays },
  { label: "Queue",        href: "/dentist/queue",        icon: ListOrdered },
  { label: "Treatments",   href: "/dentist/treatments",   icon: Stethoscope },
  { label: "Payments",     href: "/dentist/payments",     icon: CreditCard },
  { label: "Follow-Ups",   href: "/dentist/follow-ups",   icon: Bell },
  { label: "Analytics",    href: "/dentist/analytics",    icon: BarChart3 },
  { label: "Settings",     href: "/dentist/settings",     icon: Settings },
];

const RECEPTIONIST_NAV: NavItem[] = [
  { label: "Dashboard",    href: "/receptionist",              icon: LayoutDashboard },
  { label: "Patients",     href: "/receptionist/patients",     icon: Users },
  { label: "Appointments", href: "/receptionist/appointments", icon: CalendarDays },
  { label: "Queue",        href: "/receptionist/queue",        icon: ListOrdered },
  { label: "Payments",     href: "/receptionist/payments",     icon: CreditCard },
];

interface DashboardSidebarProps {
  role: "dentist" | "receptionist" | "patient";
  fullName: string;
}

export function DashboardSidebar({ role, fullName }: DashboardSidebarProps) {
  const pathname = usePathname();
  const navItems = role === "dentist" ? DENTIST_NAV : RECEPTIONIST_NAV;

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
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-[#18181B] flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
              <path
                d="M12 3C10.4 3 9 4.1 8.5 5.5C7.5 5.2 6.3 5.5 5.5 6.3C4.7 7.1 4.4 8.3 4.7 9.3C3.3 9.8 2.5 11 2.5 12.5C2.5 14 3.3 15.2 4.7 15.7C4.4 16.7 4.7 17.9 5.5 18.7C6.3 19.5 7.5 19.8 8.5 19.5C9 20.9 10.4 22 12 22C13.6 22 15 20.9 15.5 19.5C16.5 19.8 17.7 19.5 18.5 18.7C19.3 17.9 19.6 16.7 19.3 15.7C20.7 15.2 21.5 14 21.5 12.5C21.5 11 20.7 9.8 19.3 9.3C19.6 8.3 19.3 7.1 18.5 6.3C17.7 5.5 16.5 5.2 15.5 5.5C15 4.1 13.6 3 12 3Z"
                fill="#FAFAFA"
              />
            </svg>
          </div>
          <span className="text-sm font-semibold text-[#09090B] tracking-tight">DentGrow</span>
        </div>
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
