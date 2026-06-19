"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/shared/SignOutButton";

interface PortalNavProps {
  patientId: string | null;
}

const NAV_ITEMS = [
  { label: "Home",         href: "/portal" },
  { label: "Appointments", href: "/portal/appointments" },
  { label: "Queue",        href: "/portal/queue" },
  { label: "Treatments",   href: "/portal/treatments" },
  { label: "Payments",     href: "/portal/payments" },
  { label: "Follow-Ups",   href: "/portal/follow-ups" },
  { label: "Profile",      href: "/portal/profile" },
];

/**
 * PortalNav
 *
 * Patient portal top navigation bar.
 * Mobile-first — collapses to bottom tab bar on small screens.
 * Hidden when no portal link exists (setup flow).
 */
export function PortalNav({ patientId }: PortalNavProps) {
  const pathname = usePathname();

  if (!patientId) return null;

  return (
    <header className="bg-white border-b sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <span className="text-lg font-bold text-blue-600">DentGrow</span>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1">
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
                    "px-3 py-1 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <SignOutButton className="hidden sm:block" />
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex">
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
                "flex-1 flex flex-col items-center py-2 text-xs font-medium",
                isActive ? "text-blue-600" : "text-gray-500"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
