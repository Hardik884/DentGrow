"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { uploadSignature, deleteSignature } from "@/actions/signature";
import {
  ALLOWED_SIGNATURE_TYPES,
  MAX_SIGNATURE_SIZE,
} from "@/lib/signatures/constants";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { cn } from "@/lib/utils";
import { PenLine, Trash2, UploadCloud, CheckCircle2 } from "lucide-react";

interface SignatureSettingsProps {
  /** Current signature public URL, or null if none uploaded. */
  initialUrl: string | null;
}

/**
 * SignatureSettings
 *
 * Dentist Settings — Digital Signature section.
 *
 * Upload a signature ONCE (PNG/JPG, max 4 MB). It is stored securely and is
 * then resolved automatically onto every completed treatment shown to patients
 * — the dentist never signs individual treatments.
 *
 * Features: live preview, replace, delete (with confirmation), upload progress,
 * Save disabled while uploading, success/error toasts.
 */
export function SignatureSettings({ initialUrl }: SignatureSettingsProps) {
  const [savedUrl, setSavedUrl] = useState<string | null>(initialUrl);

  // Locally selected (not-yet-saved) file + its object URL preview.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up the object URL when the pending file changes/unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, [previewUrl]);

  const hasSignature = Boolean(savedUrl);
  const displayUrl = previewUrl ?? savedUrl;

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    if (!ALLOWED_SIGNATURE_TYPES.includes(file.type as (typeof ALLOWED_SIGNATURE_TYPES)[number])) {
      toast.error("Unsupported file type. Please upload a PNG or JPG image.");
      return;
    }
    if (file.size > MAX_SIGNATURE_SIZE) {
      toast.error("File too large. Maximum size is 4 MB.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function startProgress() {
    setProgress(8);
    progressTimer.current = setInterval(() => {
      // Ease towards 90% while the server action runs; jump to 100% on success.
      setProgress((p) => (p >= 90 ? 90 : p + Math.max(1, Math.round((90 - p) / 8))));
    }, 200);
  }

  function stopProgress(complete: boolean) {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
    setProgress(complete ? 100 : 0);
  }

  async function handleSave() {
    if (!pendingFile) return;
    setIsUploading(true);
    startProgress();

    try {
      const fd = new FormData();
      fd.append("file", pendingFile);
      const res = await uploadSignature(fd);

      if (res.error || !res.data) {
        stopProgress(false);
        toast.error(res.error ?? "Failed to upload signature.");
        return;
      }

      stopProgress(true);
      setSavedUrl(res.data.url);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPendingFile(null);
      toast.success("Signature saved successfully.");
    } catch {
      stopProgress(false);
      toast.error("Unexpected error while uploading signature.");
    } finally {
      setIsUploading(false);
      // Reset the bar shortly after a successful completion.
      setTimeout(() => setProgress(0), 600);
    }
  }

  function handleCancelSelection() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPendingFile(null);
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await deleteSignature();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setSavedUrl(null);
      handleCancelSelection();
      toast.success("Signature deleted.");
      setConfirmDelete(false);
    } catch {
      toast.error("Unexpected error while deleting signature.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-surface-muted">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-1">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-accent" aria-hidden />
            <h3 className="text-sm font-semibold text-text-primary">Digital Signature</h3>
          </div>
          <p className="text-xs text-text-secondary">
            Upload your signature once. It is added automatically to every completed
            treatment your patients view — you never have to sign individually.
          </p>
        </div>

        {/* ── Preview ────────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-xs font-medium text-text-body">Preview</p>

          {displayUrl ? (
            <div className="inline-flex flex-col gap-2">
              <div className="relative flex items-center justify-center h-32 w-64 rounded-lg border border-border bg-background p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayUrl}
                  alt="Dentist signature preview"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              {previewUrl && (
                <span className="inline-flex items-center gap-1 text-[11px] text-text-disabled">
                  Unsaved preview — click Save Signature to apply.
                </span>
              )}
              {!previewUrl && hasSignature && (
                <span className="inline-flex items-center gap-1 text-[11px] text-success">
                  <CheckCircle2 className="h-3 w-3" aria-hidden /> Active signature
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 w-64 rounded-lg border border-dashed border-border bg-background">
              <span className="text-xs text-text-disabled">No signature uploaded</span>
            </div>
          )}
        </div>

        {/* ── Upload control ─────────────────────────────────── */}
        <div className="px-6 py-5 space-y-3">
          <p className="text-xs font-medium text-text-body">
            {hasSignature || pendingFile ? "Replace signature" : "Upload signature"}
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            onChange={handleSelect}
            disabled={isUploading || isDeleting}
            className="hidden"
            aria-label="Upload signature image"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isDeleting}
            >
              <UploadCloud className="h-4 w-4" aria-hidden />
              Choose PNG / JPG
            </Button>

            {pendingFile && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancelSelection}
                disabled={isUploading}
              >
                Cancel
              </Button>
            )}
          </div>

          <p className="text-[11px] text-text-disabled">PNG or JPG, up to 4 MB.</p>

          {/* Upload progress */}
          {isUploading || progress > 0 ? (
            <div className="space-y-1" aria-live="polite">
              <div className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full bg-accent transition-all duration-200"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[11px] text-text-secondary">
                {progress >= 100 ? "Upload complete" : `Uploading… ${progress}%`}
              </p>
            </div>
          ) : null}
        </div>

        {/* ── Actions ────────────────────────────────────────── */}
        <div className="px-6 py-4 bg-background flex items-center justify-between gap-3">
          <div>
            {hasSignature && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                disabled={isUploading || isDeleting}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete
              </Button>
            )}
          </div>

          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!pendingFile || isUploading || isDeleting}
            isLoading={isUploading}
          >
            {isUploading ? "Saving…" : "Save Signature"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete signature?"
        description="Your signature will be removed and will no longer appear on completed treatments shown to patients. You can upload a new one anytime."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
