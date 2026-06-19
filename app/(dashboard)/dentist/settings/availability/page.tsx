import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { AvailabilityRulesManager } from "@/components/dentist/AvailabilityRulesManager";
import { getAvailabilityRules } from "@/actions/availability";

export const metadata: Metadata = {
  title: "Availability Rules — DentGrow",
};

/**
 * /dentist/settings/availability
 * Availability rules management — dentist role only.
 * Manage weekly recurring booking windows (day, start time, end time, slot duration).
 * Mutations go through actions/availability.ts Server Actions.
 * Changes take effect immediately — slots are generated dynamically at query time.
 */
export default async function AvailabilityRulesPage() {
  const { data: rules } = await getAvailabilityRules();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Availability Rules"
        backHref="/dentist/settings"
      />
      <AvailabilityRulesManager initialRules={rules ?? []} />
    </div>
  );
}

