"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/shared/SignOutButton";
import { DentGrowLogo } from "@/components/shared/DentGrowLogo";
import {
  LayoutDashboard,
  CalendarDays,
  ListOrdered,
  Stethoscope,
  CreditCard,
  Bell,
  User,
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
  { label: "Profile",      href: "/portal/profile",      icon: User },
];

export function PortalNav({ patientId }: PortalNavProps) {
  const pathname = usePathname();

  if (!patientId) return null;

  return (
    <header className="bg-white border-b border-[#E4E4E7] sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Brand */}
          <DentGrowLogo size={28} withWordmark />

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
