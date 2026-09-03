"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportMyData } from "@/actions/data-export";

/**
 * DataExportCard — "download a copy of my record".
 *
 * WHY THE FILE IS BUILT IN THE BROWSER
 *   The Server Action returns the export as data in its response; this turns it
 *   into a Blob and saves it. Nothing is ever written to storage and no URL is
 *   minted, so there is no artefact to leak, expire or forget to clean up — see
 *   lib/data-export.ts. The object URL created here lives for one tick and is
 *   revoked immediately.
 *
 * WHY JSON
 *   An export is a complete structured record, not a report. JSON keeps every
 *   field, every relationship and every date intact, which a PDF or a
 *   spreadsheet would flatten — and it is what another system would need if the
 *   patient is moving to a different clinic. The file carries its own
 *   `export.excluded` list so whoever opens it can tell what is deliberately
 *   not in it.
 */
export function DataExportCard() {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const result = await exportMyData();

      if (result.error || !result.data) {
        toast.error(result.error ?? "Could not build your export.");
        return;
      }

      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `oramedha-my-record-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      // Revoked straight away: an object URL left alive is a copy of the whole
      // record addressable from anything running on the page.
      URL.revokeObjectURL(url);

      toast.success("Your record has been downloaded.");
    } catch {
      toast.error("Could not build your export. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-xs">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            Download your record
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
            A copy of everything your clinic holds about you here — visits,
            treatments, prescriptions, payments and consents — as a single file.
            Your X-rays and documents are downloaded individually from your
            treatment history.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={download}
          disabled={busy}
          className="shrink-0"
        >
          <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {busy ? "Preparing…" : "Download"}
        </Button>
      </div>
    </section>
  );
}
