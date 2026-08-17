"use client";

import { useState } from "react";
import { Download, Printer, MessageCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizeIndianWhatsAppNumber, buildWhatsAppShareUrl } from "@/lib/whatsapp/phone";

interface ConsentActionsProps {
  /** DOM id of the <ConsentDocument> root (or an uploaded-file preview) — the
   *  same node is captured for Download PDF, Print, and WhatsApp so all three
   *  are always the exact same document. */
  targetId: string;
  fileName: string;
  patientName: string;
  clinicName: string;
  patientPhone: string | null;
  /** Staff-only action — never rendered in the patient portal. */
  showWhatsApp: boolean;
  addPhoneHref?: string;
  /** When set, WhatsApp shares this already-stored file (uploaded consents)
   *  instead of capturing the DOM to a PDF. */
  directFileUrl?: string | null;
}

/**
 * ConsentActions — Download PDF / Print / Send on WhatsApp for a consent.
 * Cloned from components/billing/InvoiceActions.tsx (same capture + share
 * mechanics), with consent-specific messaging. Nothing is ever auto-sent —
 * WhatsApp always requires the user to press Send.
 */
export function ConsentActions({
  targetId,
  fileName,
  patientName,
  clinicName,
  patientPhone,
  showWhatsApp,
  addPhoneHref,
  directFileUrl,
}: ConsentActionsProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pdf" | "whatsapp" | null>(null);

  async function generatePdfBlob(): Promise<Blob | null> {
    const node = window.document.getElementById(targetId);
    if (!node) return null;

    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
      import("jspdf"),
      import("html2canvas-pro"),
    ]);

    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });

    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL("image/png");

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    return pdf.output("blob");
  }

  function downloadBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = fileName;
    window.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleDownload() {
    setBusy("pdf");
    setStatus(null);
    try {
      const blob = await generatePdfBlob();
      if (!blob) {
        setStatus("Could not generate the PDF.");
        return;
      }
      downloadBlob(blob);
    } catch (err) {
      console.error("[ConsentActions] download PDF failed:", err);
      setStatus("Could not generate the PDF.");
    } finally {
      setBusy(null);
    }
  }

  function handlePrint() {
    window.print();
  }

  async function handleWhatsApp() {
    setBusy("whatsapp");
    setStatus(null);
    try {
      const phoneResult = normalizeIndianWhatsAppNumber(patientPhone);
      if (!phoneResult.ok) {
        setStatus("missing-phone");
        return;
      }

      const message = `Hello ${patientName}, please find your consent form from ${clinicName}.`;

      // For an uploaded consent we already have the exact signed file; share it
      // directly rather than re-rendering. Otherwise capture the document to PDF.
      let blob: Blob | null = null;
      if (directFileUrl) {
        try {
          const res = await fetch(directFileUrl);
          blob = await res.blob();
        } catch {
          blob = null;
        }
      } else {
        blob = await generatePdfBlob();
      }

      if (blob) {
        const type = blob.type || "application/pdf";
        const name = directFileUrl ? fileName : fileName;
        const file = new File([blob], name, { type });
        const nav = navigator as Navigator & {
          canShare?: (data: { files: File[] }) => boolean;
          share?: (data: { files: File[]; text?: string; title?: string }) => Promise<void>;
        };
        if (nav.canShare?.({ files: [file] }) && nav.share) {
          await nav.share({ files: [file], text: message, title: fileName });
          setStatus("Share sheet opened — choose WhatsApp, then press Send.");
          return;
        }
      }

      if (blob) downloadBlob(blob);
      window.open(buildWhatsAppShareUrl(phoneResult.digits, message), "_blank", "noopener,noreferrer");
      setStatus(
        blob
          ? "Consent downloaded and WhatsApp opened — attach the file and press Send."
          : "WhatsApp opened — press Send to send the consent."
      );
    } catch (err) {
      console.error("[ConsentActions] WhatsApp share failed:", err);
      setStatus("Could not open WhatsApp.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="no-print space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleDownload} isLoading={busy === "pdf"}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          Download PDF
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-3.5 w-3.5" aria-hidden />
          Print
        </Button>
        {showWhatsApp && (
          <Button variant="secondary" size="sm" onClick={handleWhatsApp} isLoading={busy === "whatsapp"}>
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            Send
          </Button>
        )}
      </div>

      {status === "missing-phone" && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] rounded-md px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Patient phone number is missing.</span>
          {addPhoneHref && (
            <a href={addPhoneHref} className="font-medium underline shrink-0">
              Add Phone Number
            </a>
          )}
        </div>
      )}

      {status && status !== "missing-phone" && <p className="text-xs text-[#71717A]">{status}</p>}
    </div>
  );
}
