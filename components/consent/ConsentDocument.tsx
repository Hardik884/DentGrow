import { formatDateInTimezone } from "@/lib/utils";
import type { ConsentSnapshot } from "@/lib/consents/content";
import type { ConsentStatus } from "@/lib/consents/status";

interface ConsentDocumentProps {
  snapshot: ConsentSnapshot;
  status: ConsentStatus;
  /** Patient's captured signature (PNG data URL) — present once signed. */
  patientSignature?: string | null;
  patientSignedName?: string | null;
  signedAt?: string | null;
  timezone?: string;
  className?: string;
}

/**
 * ConsentDocument — the ONE canonical consent renderer.
 *
 * Used unmodified by the staff consent view, the patient portal, and captured
 * as the exact DOM node for Download PDF / Print / WhatsApp (see
 * ConsentActions). Pure/presentational: it renders a resolved ConsentSnapshot,
 * never fetching or computing. Hardcoded hex colours (not CSS vars) so
 * html2canvas-pro captures it faithfully, exactly like InvoiceDocument.
 *
 * For a SIGNED digital consent this renders the frozen snapshot verbatim — the
 * legal record. For a draft it renders a live preview with empty signature
 * lines.
 */
export function ConsentDocument({
  snapshot,
  status,
  patientSignature,
  patientSignedName,
  signedAt,
  timezone = "Asia/Kolkata",
  className,
}: ConsentDocumentProps) {
  const { content, patient, treatment, clinic, dentist } = snapshot;
  const isSigned = status === "signed";

  return (
    <div
      id="consent-document"
      className={`print-consent document-light mx-auto w-full max-w-[210mm] bg-white text-[#151918] p-4 sm:p-6 md:p-8 ${className ?? ""}`}
    >
      {/* ── Letterhead ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 pb-3 border-b-2 border-[#0D6B5E]">
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight text-[#151918]">{clinic.name}</h1>
          {clinic.address && (
            <p className="text-[10px] text-[#737A76] mt-0.5 max-w-xs">{clinic.address}</p>
          )}
          <p className="text-[10px] text-[#737A76] mt-0.5">
            {[clinic.phone, clinic.email].filter(Boolean).join(" · ") || null}
          </p>
          {clinic.registrationNumber && (
            <p className="text-[9px] text-[#9BA39D] mt-0.5">Reg. No. {clinic.registrationNumber}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold tracking-wide text-[#151918]">CONSENT FORM</p>
          <p className="text-[11px] text-[#737A76] mt-0.5 max-w-[200px]">{snapshot.templateName}</p>
        </div>
      </div>

      {/* ── Patient / treatment ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 py-3 border-b border-[#E3E9E6]">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[#9BA39D] mb-0.5">
            Patient
          </p>
          <p className="text-sm font-semibold text-[#151918]">{patient.name}</p>
          <p className="text-[11px] text-[#737A76]">
            {[
              patient.age != null ? `Age ${patient.age}` : null,
              patient.phone,
            ]
              .filter(Boolean)
              .join(" · ") || null}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[#9BA39D] mb-0.5">
            Proposed Treatment
          </p>
          <p className="text-sm text-[#151918]">{treatment.type ?? snapshot.templateName}</p>
        </div>
      </div>

      {/* ── Prose sections ──────────────────────────────────────── */}
      <div className="py-3 space-y-2">
        {content.sections
          .filter((s) => s.body.trim().length > 0)
          .map((section) => (
            <div key={section.key} style={{ pageBreakInside: "avoid" }}>
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-[#333B36] mb-0.5">
                {section.title}
              </h2>
              <p className="text-[12px] leading-snug text-[#09544B] whitespace-pre-wrap">
                {section.body}
              </p>
            </div>
          ))}
      </div>

      {/* ── Disclaimer ──────────────────────────────────────────── */}
      {content.disclaimer && (
        <div className="my-2 rounded-md border border-[#E3E9E6] bg-[#F6F8F6] px-3 py-2">
          <p className="text-[10px] leading-snug text-[#5B635E]">{content.disclaimer}</p>
        </div>
      )}

      {/* ── Signatures ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-6 pt-4 mt-2" style={{ pageBreakInside: "avoid" }}>
        {/* Patient */}
        <div>
          <div className="h-12 flex items-end">
            {isSigned && patientSignature ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={patientSignature}
                alt="Patient signature"
                className="max-h-12 max-w-[200px] object-contain"
              />
            ) : (
              <span className="text-[9px] text-[#9BA39D]">Signature</span>
            )}
          </div>
          <div className="border-t border-[#0D6B5E] pt-1">
            <p className="text-[11px] font-semibold text-[#151918]">
              {patientSignedName || patient.name}
            </p>
            <p className="text-[9px] text-[#737A76]">Patient Signature</p>
            <p className="text-[9px] text-[#737A76] mt-0.5">
              Date:{" "}
              {isSigned && signedAt ? formatDateInTimezone(signedAt, timezone) : "________________"}
            </p>
          </div>
        </div>

        {/* Dentist */}
        <div>
          <div className="h-12 flex items-end">
            {dentist.signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dentist.signatureUrl}
                alt="Dentist signature"
                className="max-h-12 max-w-[200px] object-contain"
              />
            ) : (
              <span className="text-[9px] text-[#9BA39D]">Signature</span>
            )}
          </div>
          <div className="border-t border-[#0D6B5E] pt-1">
            <p className="text-[11px] font-semibold text-[#151918]">{dentist.name || "Treating Dentist"}</p>
            <p className="text-[9px] text-[#737A76]">Dentist Signature</p>
            <p className="text-[9px] text-[#737A76] mt-0.5">
              Date:{" "}
              {isSigned && signedAt ? formatDateInTimezone(signedAt, timezone) : "________________"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Place ───────────────────────────────────────────────── */}
      {clinic.address && (
        <p className="text-[9px] text-[#9BA39D] mt-3">Place: {clinic.address}</p>
      )}
    </div>
  );
}
