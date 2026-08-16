"use client";

import { useState } from "react";
import { FileText, ImageIcon, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/utils";
import { ConsentDocument } from "@/components/consent/ConsentDocument";
import { ConsentActions } from "@/components/consent/ConsentActions";
import { consentStatusLabel } from "@/lib/consents/status";
import type { ConsentSnapshot } from "@/lib/consents/content";
import type { ConsentListItem } from "@/actions/consents";
import { getPortalConsentDetail, getPortalConsentFileUrl } from "@/actions/consents";

/**
 * PortalConsentList — read-only consent history for the authenticated patient.
 * Patients can view and download their own signed consents. They can never
 * edit content or signatures; the patient is resolved server-side from the
 * session, never from the browser.
 */
export function PortalConsentList({ consents }: { consents: ConsentListItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (consents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#E4E4E7] px-4 py-12 text-center">
        <FileSignature className="mx-auto h-6 w-6 text-[#A1A1AA]" aria-hidden />
        <p className="mt-2 text-sm text-[#71717A]">You have no signed consent forms yet.</p>
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-[#F4F4F5] rounded-lg border border-[#E4E4E7] bg-white">
        {consents.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-[#09090B] truncate">
                  {c.treatment_type || c.template_name}
                </p>
                {c.source === "uploaded" ? (
                  <ImageIcon className="h-3 w-3 text-[#A1A1AA]" aria-hidden />
                ) : (
                  <FileText className="h-3 w-3 text-[#A1A1AA]" aria-hidden />
                )}
              </div>
              <p className="text-xs text-[#71717A] mt-0.5">
                {c.signed_at ? `Signed ${formatDate(c.signed_at)}` : formatDate(c.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <StatusBadge label={consentStatusLabel(c.status, c.source)} variant="success" />
              <Button variant="outline" size="xs" onClick={() => setOpenId(c.id)}>
                View
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {openId && <PortalConsentDetail consentId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function PortalConsentDetail({ consentId, onClose }: { consentId: string; onClose: () => void }) {
  const [snapshot, setSnapshot] = useState<ConsentSnapshot | null>(null);
  const [meta, setMeta] = useState<{
    source: string;
    signed_at: string | null;
    patient_signed_name: string | null;
    patient_signature: string | null;
    file_name: string | null;
  } | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    setLoaded(true);
    getPortalConsentDetail(consentId).then(async (res) => {
      if (res.error || !res.data) {
        setError(res.error ?? "Not found");
        return;
      }
      setSnapshot(res.data.snapshot);
      setMeta({
        source: res.data.source,
        signed_at: res.data.signed_at,
        patient_signed_name: res.data.patient_signed_name,
        patient_signature: res.data.patient_signature,
        file_name: res.data.file_name,
      });
      if (res.data.source === "uploaded") {
        const f = await getPortalConsentFileUrl(consentId);
        if (f.data) setFileUrl(f.data.url);
      }
    });
  }

  const clinicName = snapshot?.clinic.name ?? "the clinic";
  const isUploaded = meta?.source === "uploaded";

  return (
    <Dialog open onClose={onClose} size="xl" title="Consent Form" description={snapshot?.templateName}>
      <div className="p-5 space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!snapshot && !error && <p className="text-sm text-[#71717A]">Loading…</p>}

        {snapshot && isUploaded && (
          <div className="space-y-3">
            <div className="rounded-md border border-[#FEF08A] bg-[#FEFCE8] px-3 py-2">
              <p className="text-xs font-medium text-[#854D0E]">Uploaded Signed Consent</p>
              <p className="text-[11px] text-[#A16207]">
                This was signed on paper and uploaded by the clinic.
              </p>
            </div>
            <ConsentActions
              targetId="portal-consent-file"
              fileName={meta?.file_name ?? "consent"}
              patientName={snapshot.patient.name}
              clinicName={clinicName}
              patientPhone={null}
              showWhatsApp={false}
              directFileUrl={fileUrl}
            />
            <div id="portal-consent-file" className="rounded-md border border-[#E4E4E7] p-3">
              {!fileUrl ? (
                <p className="text-sm text-[#71717A]">Loading file…</p>
              ) : (meta?.file_name ?? "").match(/\.(png|jpe?g)$/i) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl} alt="Signed consent" className="max-w-full mx-auto" />
              ) : (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-[#2563EB] underline"
                >
                  Open / Download document
                </a>
              )}
            </div>
          </div>
        )}

        {snapshot && !isUploaded && (
          <>
            <ConsentActions
              targetId="consent-document"
              fileName={`Consent-${snapshot.patient.name.replace(/\s+/g, "_")}.pdf`}
              patientName={snapshot.patient.name}
              clinicName={clinicName}
              patientPhone={null}
              showWhatsApp={false}
            />
            <div className="rounded-md border border-[#E4E4E7] overflow-hidden">
              <ConsentDocument
                snapshot={snapshot}
                status="signed"
                patientSignature={meta?.patient_signature}
                patientSignedName={meta?.patient_signed_name}
                signedAt={meta?.signed_at}
              />
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
