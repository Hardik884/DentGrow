"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/shared/SignOutButton";
import {
  LayoutDashboard,
  CalendarDays,
  ListOrdered,
  Stethoscope,
  CreditCard,
  Bell,
  type LucideIcon,
} from "lucide-react";

interface PortalNavProps {
  patientId: string | null;
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Home",         href: "/portal",              icon: LayoutDashboard },
  { label: "Appointments", href: "/portal/appointments", icon: CalendarDays },
  { label: "Queue",        href: "/portal/queue",        icon: ListOrdered },
  { label: "Treatments",   href: "/portal/treatments",   icon: Stethoscope },
  { label: "Payments",     href: "/portal/payments",     icon: CreditCard },
  { label: "Follow-Ups",   href: "/portal/follow-ups",   icon: Bell },
];

export function PortalNav({ patientId }: PortalNavProps) {
  const pathname = usePathname();

  if (!patientId) return null;

  return (
    <header className="bg-white border-b border-[#E4E4E7] sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-[#18181B] flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
                <path
                  d="M12 3C10.4 3 9 4.1 8.5 5.5C7.5 5.2 6.3 5.5 5.5 6.3C4.7 7.1 4.4 8.3 4.7 9.3C3.3 9.8 2.5 11 2.5 12.5C2.5 14 3.3 15.2 4.7 15.7C4.4 16.7 4.7 17.9 5.5 18.7C6.3 19.5 7.5 19.8 8.5 19.5C9 20.9 10.4 22 12 22C13.6 22 15 20.9 15.5 19.5C16.5 19.8 17.7 19.5 18.5 18.7C19.3 17.9 19.6 16.7 19.3 15.7C20.7 15.2 21.5 14 21.5 12.5C21.5 11 20.7 9.8 19.3 9.3C19.6 8.3 19.3 7.1 18.5 6.3C17.7 5.5 16.5 5.2 15.5 5.5C15 4.1 13.6 3 12 3Z"
                  fill="white"
                />
              </svg>
            </div>
            <span className="text-sm font-semibold text-[#09090B] tracking-tight">DentGrow</span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1" aria-label="Portal navigation">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === "/portal"
                  ? pathname === item.href
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    isActive
                      ? "bg-[#F4F4F5] text-[#09090B]"
                      : "text-[#71717A] hover:text-[#09090B] hover:bg-[#F4F4F5]"
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

      {/* Mobile bottom tab bar */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#E4E4E7] flex z-20"
        aria-label="Mobile portal navigation"
      >
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/portal"
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                isActive ? "text-[#09090B]" : "text-[#A1A1AA]"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <item.icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
