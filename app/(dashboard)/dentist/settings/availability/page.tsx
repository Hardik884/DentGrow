import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";

export const metadata: Metadata = {
  title: "Availability Rules — DentGrow",
};

/**
 * /dentist/settings/availability
 * Availability rules management — dentist role only.
 * Manage weekly recurring booking windows (day, start time, end time, slot duration).
 * Submits to actions/availability.ts → createAvailabilityRule() / updateAvailabilityRule()
 */
export default async function AvailabilityRulesPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Availability Rules"
        backHref="/dentist/settings"
        action={{ label: "Add Rule", href: "#" }}
      />
      {/* TODO: AvailabilityRulesList with toggle active/inactive + add form */}
    </div>
  );
}
