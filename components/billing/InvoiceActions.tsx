"use client";

import { useState } from "react";
import { Download, Printer, MessageCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizeIndianWhatsAppNumber, buildWhatsAppShareUrl } from "@/lib/whatsapp/phone";

interface InvoiceActionsProps {
  /** DOM id of the <InvoiceDocument> root — the same node is captured for
   * Download PDF, Print (native) and the file shared via WhatsApp, so all
   * three are always the exact same document. */
  targetId: string;
  fileName: string;
  patientName: string;
  clinicName: string;
  patientPhone: string | null;
  /** Staff-only action — never shown to patients (CLAUDE.md §PATIENT PORTAL). */
  showWhatsApp: boolean;
  /** Where "Add Phone Number" should send a staff user when the phone is missing/invalid. */
  addPhoneHref?: string;
}

/**
 * InvoiceActions — Download PDF / Print / Send on WhatsApp, all built on the
 * SAME captured document (see InvoiceDocument). No calculation happens here.
 */
export function InvoiceActions({
  targetId,
  fileName,
  patientName,
  clinicName,
  patientPhone,
  showWhatsApp,
  addPhoneHref,
}: InvoiceActionsProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pdf" | "whatsapp" | null>(null);

  /** Render the invoice DOM node to a multi-page A4 PDF blob. */
  async function generatePdfBlob(): Promise<Blob | null> {
    const node = window.document.getElementById(targetId);
    if (!node) return null;

    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
      import("jspdf"),
      import("html2canvas-pro"),
    ]);

    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL("image/png");

    // Slice the single tall canvas across as many A4 pages as needed — a long
    // bill (many treatments/OPD/X-ray lines) supports multiple pages, per spec.
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
      console.error("[InvoiceActions] download PDF failed:", err);
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

      const message = `Hello ${patientName}, please find your bill from ${clinicName}.`;
      const blob = await generatePdfBlob();

      // Preferred path: the Web Share API with a file attachment. This is the
      // only mechanism that can hand the PDF to WhatsApp pre-attached — it
      // opens the OS share sheet, the clinic user picks WhatsApp, and the
      // message still requires an explicit press of Send inside WhatsApp.
      if (blob) {
        const file = new File([blob], fileName, { type: "application/pdf" });
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

      // Fallback (most desktop browsers have no file Web Share support):
      // download the same PDF and open the WhatsApp chat with the message
      // pre-filled, so the user attaches the just-downloaded file themselves.
      if (blob) downloadBlob(blob);
      window.open(
        buildWhatsAppShareUrl(phoneResult.digits, message),
        "_blank",
        "noopener,noreferrer"
      );
      setStatus(
        blob
          ? "Bill downloaded and WhatsApp opened — attach the bill and press Send."
          : "WhatsApp opened — press Send to send the bill."
      );
    } catch (err) {
      console.error("[InvoiceActions] WhatsApp share failed:", err);
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
          <Button
            variant="secondary"
            size="sm"
            onClick={handleWhatsApp}
            isLoading={busy === "whatsapp"}
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            Send on WhatsApp
          </Button>
        )}
      </div>

      {status === "missing-phone" && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-danger bg-danger-bg border border-danger-border rounded-md px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Patient phone number is missing.</span>
          {addPhoneHref && (
            <a href={addPhoneHref} className="font-medium underline shrink-0">
              Add Phone Number
            </a>
          )}
        </div>
      )}

      {status && status !== "missing-phone" && (
        <p className="text-xs text-text-secondary">{status}</p>
      )}
    </div>
  );
}
