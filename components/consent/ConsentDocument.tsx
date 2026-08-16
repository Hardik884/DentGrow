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
      className={`print-consent mx-auto w-full max-w-[210mm] bg-white text-[#09090B] p-8 sm:p-10 ${className ?? ""}`}
    >
      {/* ── Letterhead ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 pb-6 border-b-2 border-[#18181B]">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-[#09090B]">{clinic.name}</h1>
          {clinic.address && (
            <p className="text-xs text-[#71717A] mt-1 max-w-xs">{clinic.address}</p>
          )}
          <p className="text-xs text-[#71717A] mt-0.5">
            {[clinic.phone, clinic.email].filter(Boolean).join(" · ") || null}
          </p>
          {clinic.registrationNumber && (
            <p className="text-[10px] text-[#A1A1AA] mt-0.5">Reg. No. {clinic.registrationNumber}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold tracking-wide text-[#09090B]">CONSENT FORM</p>
          <p className="text-xs text-[#71717A] mt-1 max-w-[200px]">{snapshot.templateName}</p>
          <p className="text-[10px] text-[#A1A1AA] mt-0.5">
            Template v{snapshot.templateVersion}
          </p>
        </div>
      </div>

      {/* ── Patient / treatment ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-6 py-5 border-b border-[#E4E4E7]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A1A1AA] mb-1">
            Patient
          </p>
          <p className="text-sm font-semibold text-[#09090B]">{patient.name}</p>
          <p className="text-xs text-[#71717A] mt-0.5">
            {[
              patient.age != null ? `Age ${patient.age}` : null,
              patient.phone,
            ]
              .filter(Boolean)
              .join(" · ") || null}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A1A1AA] mb-1">
            Proposed Treatment
          </p>
          <p className="text-sm text-[#09090B]">{treatment.type ?? snapshot.templateName}</p>
        </div>
      </div>

      {/* ── Prose sections ──────────────────────────────────────── */}
      <div className="py-5 space-y-4">
        {content.sections
          .filter((s) => s.body.trim().length > 0)
          .map((section) => (
            <div key={section.key} style={{ pageBreakInside: "avoid" }}>
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#3F3F46] mb-1">
                {section.title}
              </h2>
              <p className="text-[13px] leading-relaxed text-[#27272A] whitespace-pre-wrap">
                {section.body}
              </p>
            </div>
          ))}
      </div>

      {/* ── Disclaimer ──────────────────────────────────────────── */}
      {content.disclaimer && (
        <div className="my-4 rounded-md border border-[#E4E4E7] bg-[#FAFAFA] px-4 py-3">
          <p className="text-[11px] leading-relaxed text-[#52525B]">{content.disclaimer}</p>
        </div>
      )}

      {/* ── Signatures ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-8 pt-8 mt-4" style={{ pageBreakInside: "avoid" }}>
        {/* Patient */}
        <div>
          <div className="h-16 flex items-end">
            {isSigned && patientSignature ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={patientSignature}
                alt="Patient signature"
                className="max-h-16 max-w-[220px] object-contain"
              />
            ) : (
              <span className="text-[10px] text-[#A1A1AA]">Signature</span>
            )}
          </div>
          <div className="border-t border-[#18181B] pt-1">
            <p className="text-xs font-semibold text-[#09090B]">
              {patientSignedName || patient.name}
            </p>
            <p className="text-[10px] text-[#71717A]">Patient Signature</p>
            <p className="text-[10px] text-[#71717A] mt-1">
              Date:{" "}
              {isSigned && signedAt ? formatDateInTimezone(signedAt, timezone) : "________________"}
            </p>
          </div>
        </div>

        {/* Dentist */}
        <div>
          <div className="h-16 flex items-end">
            {dentist.signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dentist.signatureUrl}
                alt="Dentist signature"
                className="max-h-16 max-w-[220px] object-contain"
              />
            ) : (
              <span className="text-[10px] text-[#A1A1AA]">Signature</span>
            )}
          </div>
          <div className="border-t border-[#18181B] pt-1">
            <p className="text-xs font-semibold text-[#09090B]">{dentist.name || "Treating Dentist"}</p>
            <p className="text-[10px] text-[#71717A]">Dentist Signature</p>
            <p className="text-[10px] text-[#71717A] mt-1">
              Date:{" "}
              {isSigned && signedAt ? formatDateInTimezone(signedAt, timezone) : "________________"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Place ───────────────────────────────────────────────── */}
      {clinic.address && (
        <p className="text-[10px] text-[#A1A1AA] mt-6">Place: {clinic.address}</p>
      )}
    </div>
  );
}
