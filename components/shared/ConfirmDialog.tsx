"use client";

import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  variant?: "default" | "danger";
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  isLoading = false,
  variant = "default",
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#0B0F0E]/45 backdrop-blur-[2px]"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl border border-[#E3E9E6] shadow-2xl max-w-sm w-full p-6 space-y-4 animate-fade-in-up">
        <div className="space-y-1.5">
          <h2 id="confirm-dialog-title" className="text-base font-semibold text-[#151918]">
            {title}
          </h2>
          <p id="confirm-dialog-desc" className="text-sm text-[#737A76] leading-relaxed">
            {description}
          </p>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "default"}
            size="sm"
            onClick={onConfirm}
            disabled={isLoading}
            isLoading={isLoading}
          >
            {isLoading ? "Processing…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
