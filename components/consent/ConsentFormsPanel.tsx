"use client";

import { useState } from "react";
import { FileSignature, Upload, FileText, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/utils";
import { consentStatusLabel, type ConsentStatus, type ConsentSource } from "@/lib/consents/status";
import type { ConsentListItem } from "@/actions/consents";
import { ConsentDetailDialog } from "@/components/consent/ConsentDetailDialog";
import { UploadConsentDialog } from "@/components/consent/UploadConsentDialog";

export interface ConsentFormsPanelProps {
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  role: "dentist" | "receptionist";
  baseHref: string;
  initialConsents: ConsentListItem[];
  templates: { key: string; name: string }[];
  treatments: { id: string; treatment_type: string; appointment_id: string | null }[];
}

const STATUS_VARIANT: Record<ConsentStatus, "default" | "info" | "success" | "error"> = {
  draft: "default",
  ready_to_sign: "info",
  signed: "success",
  cancelled: "error",
};

export function ConsentFormsPanel({
  patientId,
  patientName,
  patientPhone,
  role,
  baseHref,
  initialConsents,
  templates,
  treatments,
}: ConsentFormsPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
          <Upload className="h-3.5 w-3.5" aria-hidden />
          Upload Signed Consent
        </Button>
      </div>

      {initialConsents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#E3E9E6] px-4 py-10 text-center">
          <FileSignature className="mx-auto h-6 w-6 text-[#9BA39D]" aria-hidden />
          <p className="mt-2 text-sm text-[#737A76]">No consent forms yet.</p>
          <p className="text-xs text-[#9BA39D]">
            Create one from a treatment, or upload a signed paper consent.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#EEF2F0] rounded-lg border border-[#E3E9E6]">
          {initialConsents.map((c) => {
            const source = c.source as ConsentSource;
            const primaryLabel =
              c.status === "draft" || c.status === "ready_to_sign" ? "Continue" : "View";
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#151918] truncate">
                      {c.treatment_type || c.template_name}
                    </p>
                    {source === "uploaded" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[#737A76]">
                        <ImageIcon className="h-3 w-3" aria-hidden /> Uploaded
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[#737A76]">
                        <FileText className="h-3 w-3" aria-hidden /> Digital
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#737A76] mt-0.5">
                    {c.template_name}
                    {" · "}
                    {c.signed_at
                      ? `Signed ${formatDate(c.signed_at)}`
                      : `Created ${formatDate(c.created_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge
                    label={consentStatusLabel(c.status as ConsentStatus, source)}
                    variant={STATUS_VARIANT[c.status as ConsentStatus]}
                  />
                  <Button variant="outline" size="xs" onClick={() => setOpenId(c.id)}>
                    {primaryLabel}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {openId && (
        <ConsentDetailDialog
          consentId={openId}
          role={role}
          patientName={patientName}
          patientPhone={patientPhone}
          baseHref={baseHref}
          onClose={() => setOpenId(null)}
        />
      )}

      <UploadConsentDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        patientId={patientId}
        templates={templates}
        treatments={treatments}
        onUploaded={() => {
          setUploadOpen(false);
        }}
      />
    </div>
  );
}
