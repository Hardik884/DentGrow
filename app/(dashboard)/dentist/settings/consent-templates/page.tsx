import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { ConsentTemplateManager } from "@/components/consent/ConsentTemplateManager";
import { getConsentTemplates } from "@/actions/consent-templates";

export const metadata: Metadata = {
  title: "Consent Templates",
};

/**
 * /dentist/settings/consent-templates
 *
 * Clinic-approved consent template management (dentist role only, enforced by
 * middleware + the server action's role guard). Templates are provisioned from
 * the code defaults on first load and are thereafter clinic-owned and versioned.
 */
export default async function ConsentTemplatesPage() {
  const res = await getConsentTemplates();

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Consent Templates" backHref="/dentist/settings" />

      {res.error ? (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {res.error}
        </p>
      ) : (
        <ConsentTemplateManager templates={res.data ?? []} />
      )}
    </div>
  );
}
