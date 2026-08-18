"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText, PenLine, Ban, Save } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConsentDocument } from "@/components/consent/ConsentDocument";
import { ConsentActions } from "@/components/consent/ConsentActions";
import { SignaturePad } from "@/components/consent/SignaturePad";
import type { ConsentSnapshot } from "@/lib/consents/content";
import { isConsentEditable, canSignConsent, canCancelConsent, type ConsentStatus } from "@/lib/consents/status";
import {
  getConsent,
  updateConsentDraft,
  signConsent,
  cancelConsent,
  getConsentFileUrl,
} from "@/actions/consents";
import { isImageMime } from "@/lib/consents/constants";
import type { Consent } from "@/types";

interface ConsentDetailDialogProps {
  consentId: string;
  role: "dentist" | "receptionist";
  /** Optional — falls back to the consent snapshot's patient name when omitted. */
  patientName?: string;
  /** Optional — falls back to the consent snapshot's patient phone when omitted. */
  patientPhone?: string | null;
  baseHref: string;
  onClose: () => void;
  /**
   * Optional hook for a parent that keeps its own local copy of the consent.
   * Not needed just to see the change: every mutating consent action calls
   * revalidatePath, so the Server Action response already re-renders the page.
   */
  onChanged?: () => void;
}

export function ConsentDetailDialog({
  consentId,
  role,
  patientName,
  patientPhone,
  baseHref,
  onClose,
  onChanged,
}: ConsentDetailDialogProps) {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // edit state
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);

  // sign state
  const [signing, setSigning] = useState(false);
  const [signName, setSignName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);

  // uploaded-file view
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  async function load() {
    const res = await getConsent(consentId);
    if (res.error || !res.data) {
      setLoadError(res.error ?? "Consent not found.");
      return;
    }
    setConsent(res.data);
    setLoadError(null);
    // Default the sign-name to the provided name, falling back to the
    // snapshot's patient name (the inline treatment flow has no name prop).
    const snap = res.data.content_snapshot as unknown as ConsentSnapshot | null;
    setSignName(patientName ?? snap?.patient?.name ?? "");
    if (res.data.source === "uploaded") {
      const f = await getConsentFileUrl(consentId);
      if (f.data) setFileUrl(f.data.url);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consentId]);

  const snapshot = (consent?.content_snapshot as unknown as ConsentSnapshot | null) ?? null;
  const status = (consent?.status as ConsentStatus | undefined) ?? "draft";
  // Patient identity for actions/labels — prefer explicit props, else the
  // frozen snapshot (so the inline treatment-form flow needs no extra props).
  const effPatientName = patientName ?? snapshot?.patient?.name ?? "Patient";
  const effPatientPhone = patientPhone ?? snapshot?.patient?.phone ?? null;
  const isDentist = role === "dentist";
  const editable = isDentist && consent?.source === "digital" && isConsentEditable(status);
  const signable = isDentist && consent ? canSignConsent(status, consent.source) : false;
  const cancellable = isDentist && consent ? canCancelConsent(status) : false;

  function beginEdit() {
    if (!snapshot) return;
    const seed: Record<string, string> = {};
    for (const s of snapshot.content.sections) {
      if (s.editablePerConsent) seed[s.key] = s.body;
    }
    setEdits(seed);
    setEditing(true);
  }

  function saveEdits() {
    const section_edits = Object.entries(edits).map(([key, body]) => ({ key, body }));
    startTransition(async () => {
      const res = await updateConsentDraft(consentId, { section_edits });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Consent updated.");
      setEditing(false);
      await load();
      onChanged?.();
    });
  }

  function setReady(next: "draft" | "ready_to_sign") {
    startTransition(async () => {
      const res = await updateConsentDraft(consentId, { status: next });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await load();
      onChanged?.();
    });
  }

  function doSign() {
    if (!signature) {
      toast.error("Please capture the patient's signature.");
      return;
    }
    startTransition(async () => {
      const res = await signConsent(consentId, {
        patient_signed_name: signName,
        patient_signature: signature,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Consent signed.");
      setSigning(false);
      await load();
      onChanged?.();
    });
  }

  function doCancel() {
    if (!confirm("Cancel this consent? This cannot be undone. A signed consent is never affected.")) return;
    startTransition(async () => {
      const res = await cancelConsent(consentId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Consent cancelled.");
      await load();
      onChanged?.();
    });
  }

  const clinicName = snapshot?.clinic.name ?? "the clinic";
  const isUploaded = consent?.source === "uploaded";

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      busy={pending}
      title="Consent Form"
      description={consent ? snapshot?.templateName : undefined}
    >
      <div className="p-5 space-y-4">
        {loadError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {loadError}
          </p>
        )}

        {!consent && !loadError && <p className="text-sm text-[#737A76]">Loading…</p>}

        {consent && isUploaded && (
          <UploadedConsentView
            fileName={consent.file_name}
            fileType={consent.file_type}
            fileUrl={fileUrl}
            patientName={effPatientName}
            patientPhone={effPatientPhone}
            clinicName={clinicName}
            showWhatsApp={role === "dentist" || role === "receptionist"}
            addPhoneHref={`${baseHref}/patients/${consent.patient_id}`}
          />
        )}

        {consent && !isUploaded && snapshot && (
          <>
            {/* Action bar (Download / Print / Send) — staff only */}
            <ConsentActions
              targetId="consent-document"
              fileName={`Consent-${effPatientName.replace(/\s+/g, "_")}.pdf`}
              patientName={effPatientName}
              clinicName={clinicName}
              patientPhone={effPatientPhone}
              showWhatsApp
              addPhoneHref={`${baseHref}/patients/${consent.patient_id}`}
            />

            {/* Dentist controls for an unsigned consent */}
            {editable && !signing && (
              <div className="no-print flex flex-wrap items-center gap-2 border-y border-[#EEF2F0] py-3">
                {!editing ? (
                  <Button variant="outline" size="sm" onClick={beginEdit}>
                    <PenLine className="h-3.5 w-3.5" aria-hidden /> Edit Details
                  </Button>
                ) : (
                  <>
                    <Button variant="default" size="sm" onClick={saveEdits} isLoading={pending}>
                      <Save className="h-3.5 w-3.5" aria-hidden /> Save Edits
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  </>
                )}
                {status === "draft" ? (
                  <Button variant="outline" size="sm" onClick={() => setReady("ready_to_sign")}>
                    Mark Ready to Sign
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setReady("draft")}>
                    Back to Draft
                  </Button>
                )}
                {signable && (
                  <Button variant="secondary" size="sm" onClick={() => setSigning(true)}>
                    <PenLine className="h-3.5 w-3.5" aria-hidden /> Patient Sign
                  </Button>
                )}
                {cancellable && (
                  <Button variant="ghost" size="sm" onClick={doCancel} className="text-[#DC2626]">
                    <Ban className="h-3.5 w-3.5" aria-hidden /> Cancel
                  </Button>
                )}
              </div>
            )}

            {/* Inline per-section editor */}
            {editing && (
              <div className="no-print space-y-3 rounded-md border border-[#E3E9E6] bg-[#F6F8F6] p-4">
                <p className="text-xs text-[#737A76]">
                  These edits affect <strong>this consent document only</strong>, not the master
                  template.
                </p>
                {snapshot.content.sections
                  .filter((s) => s.editablePerConsent)
                  .map((s) => (
                    <Field key={s.key} label={s.title} htmlFor={`edit-${s.key}`}>
                      <Textarea
                        id={`edit-${s.key}`}
                        value={edits[s.key] ?? ""}
                        onChange={(e) => setEdits((p) => ({ ...p, [s.key]: e.target.value }))}
                        rows={3}
                      />
                    </Field>
                  ))}
              </div>
            )}

            {/* Sign form */}
            {signing && (
              <div className="no-print space-y-3 rounded-md border border-[#BFDBFE] bg-[#EFF6FF] p-4">
                <p className="text-sm font-medium text-[#1E40AF]">Patient Signature</p>
                <p className="text-xs text-[#333B36]">
                  Confirm the patient has read and understood this consent and had the opportunity to
                  ask questions, then capture their signature below.
                </p>
                <Field label="Patient name" htmlFor="sign-name" required>
                  <Input
                    id="sign-name"
                    value={signName}
                    onChange={(e) => setSignName(e.target.value)}
                    placeholder="Full name"
                  />
                </Field>
                <SignaturePad onChange={setSignature} disabled={pending} />
                <div className="flex items-center gap-2">
                  <Button variant="default" size="sm" onClick={doSign} isLoading={pending}>
                    Confirm &amp; Sign
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSigning(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* The document itself (also the PDF/print capture target) */}
            <div className="rounded-md border border-[#E3E9E6] overflow-hidden">
              <ConsentDocument
                snapshot={snapshot}
                status={status}
                patientSignature={consent.patient_signature}
                patientSignedName={consent.patient_signed_name}
                signedAt={consent.signed_at}
              />
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

function UploadedConsentView({
  fileName,
  fileType,
  fileUrl,
  patientName,
  patientPhone,
  clinicName,
  showWhatsApp,
  addPhoneHref,
}: {
  fileName: string | null;
  fileType: string | null;
  fileUrl: string | null;
  patientName: string;
  patientPhone: string | null;
  clinicName: string;
  showWhatsApp: boolean;
  addPhoneHref: string;
}) {
  const isImg = isImageMime(fileType);
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2">
        <p className="text-xs font-medium text-[#854D0E]">Uploaded Signed Consent</p>
        <p className="text-[11px] text-[#A16207]">
          This consent was signed on paper outside DentGrow and uploaded. The original file is shown
          below exactly as uploaded — it was not digitally signed in DentGrow.
        </p>
      </div>

      <ConsentActions
        targetId="consent-uploaded-file"
        fileName={fileName ?? "consent"}
        patientName={patientName}
        clinicName={clinicName}
        patientPhone={patientPhone}
        showWhatsApp={showWhatsApp}
        addPhoneHref={addPhoneHref}
        directFileUrl={fileUrl}
      />

      <div id="consent-uploaded-file" className="rounded-md border border-[#E3E9E6] p-3">
        {!fileUrl ? (
          <p className="text-sm text-[#737A76]">Loading file…</p>
        ) : isImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl} alt={fileName ?? "Signed consent"} className="max-w-full mx-auto" />
        ) : (
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-[#737A76]" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm text-[#151918] truncate">{fileName}</p>
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-[#2563EB] underline"
              >
                Open / Download PDF
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
