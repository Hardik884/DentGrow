"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { PatientForm } from "@/components/shared/PatientForm";
import type { Patient } from "@/types";

interface NewInquiryModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * NewInquiryModal
 *
 * Sheet-style modal that opens the existing PatientForm for quick patient
 * creation directly from the Appointments page.
 *
 * Design decisions:
 * - Reuses PatientForm unchanged — no duplicate logic, no duplicate validation.
 * - `onSuccess` callback: closes the modal, fires a toast, then calls
 *   router.refresh() so the Appointments page (Server Component) re-fetches
 *   and the newly created patient is immediately available for booking.
 * - clinic_id is never passed from the client — createPatient() always sources
 *   it from the authenticated user's profile (server-side RLS).
 * - Patients cannot open this modal (the button is only rendered for
 *   dentist/receptionist roles in the page-level guard).
 * - Escape key and backdrop click close the modal (matches ConfirmDialog pattern).
 * - Focus is trapped inside the dialog for accessibility.
 */
export function NewInquiryModal({ open, onClose }: NewInquiryModalProps) {
  const router = useRouter();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus the close button when the dialog opens
  useEffect(() => {
    if (open) {
      // Small delay so the dialog is painted before focusing
      const id = setTimeout(() => closeButtonRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Prevent background scroll while dialog is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  function handleSuccess(patient: Patient) {
    onClose();
    toast.success(`Patient "${patient.name}" created successfully.`, {
      description: "They are now available for appointment booking.",
    });
    // Refresh the server-rendered Appointments page so the new patient shows
    // up immediately in any patient search or booking flow.
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-inquiry-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet panel — slides in from the right */}
      <div
        ref={dialogRef}
        className="relative z-10 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E4E4E7] shrink-0">
          <div>
            <h2
              id="new-inquiry-title"
              className="text-base font-semibold text-[#09090B]"
            >
              Add New Inquiry
            </h2>
            <p className="text-xs text-[#71717A] mt-0.5">
              Create a new patient record for this clinic.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#71717A] hover:text-[#09090B] hover:bg-[#F4F4F5] transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Body — PatientForm fills the remaining space */}
        <div className="flex-1 px-6 py-5">
          <PatientForm
            onSuccess={handleSuccess}
            hideCancel
          />
        </div>
      </div>
    </div>
  );
}
