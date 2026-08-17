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
  const [busy, setBusy] = useState<"pdf" | "print" | "whatsapp" | null>(null);

  /**
   * Render the document node to a SINGLE-PAGE A4 PDF.
   *
   * The whole document is fitted onto one page: it fills the page width, and if
   * that makes it taller than one page it is scaled down (and horizontally
   * centred) so it always fits on exactly one page — never sliced across two.
   * This is the one source of truth for both Download PDF and Print, so the two
   * are always identical.
   */
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
    const imgData = canvas.toDataURL("image/png");

    // Fit the entire document on one page.
    let renderWidth = pageWidth;
    let renderHeight = (canvas.height * renderWidth) / canvas.width;
    let x = 0;
    if (renderHeight > pageHeight) {
      const scale = pageHeight / renderHeight;
      renderHeight = pageHeight;
      renderWidth = pageWidth * scale;
      x = (pageWidth - renderWidth) / 2;
    }
    pdf.addImage(imgData, "PNG", x, 0, renderWidth, renderHeight);
    return pdf.output("blob");
  }

  /** Print a blob (PDF or image) via a hidden, same-origin iframe. */
  function printBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const iframe = window.document.createElement("iframe");
    iframe.className = "consent-print-frame";
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    iframe.src = url;

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      iframe.remove();
      URL.revokeObjectURL(url);
    };

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) {
          cleanup();
          return;
        }
        win.addEventListener?.("afterprint", cleanup);
        win.focus();
        win.print();
        // Safety net for browsers that never fire afterprint on the frame.
        window.setTimeout(cleanup, 60_000);
      } catch (err) {
        console.error("[ConsentActions] iframe print failed:", err);
        cleanup();
      }
    };

    window.document.body.appendChild(iframe);
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

  /**
   * Print the consent.
   *
   * The document lives inside a modal, which the CSS "hide everything, show the
   * target" print trick cannot escape (it printed blank / mis-positioned).
   * Instead we print the SAME single-page PDF that Download produces — for an
   * uploaded file we fetch the stored file — and hand it to a hidden iframe.
   * Print output is therefore always identical to the PDF and exactly one page.
   */
  async function handlePrint() {
    setBusy("print");
    setStatus(null);
    try {
      let blob: Blob | null = null;
      if (directFileUrl) {
        // Uploaded consent — fetch the stored file (same-origin blob so the
        // iframe can print it even though the signed URL is cross-origin).
        const res = await fetch(directFileUrl);
        blob = await res.blob();
      } else {
        blob = await generatePdfBlob();
      }
      if (!blob) {
        setStatus("Could not prepare the document for printing.");
        return;
      }
      printBlob(blob);
    } catch (err) {
      console.error("[ConsentActions] print failed:", err);
      setStatus("Could not print the consent.");
    } finally {
      setBusy(null);
    }
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
        <Button variant="outline" size="sm" onClick={handlePrint} isLoading={busy === "print"}>
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
