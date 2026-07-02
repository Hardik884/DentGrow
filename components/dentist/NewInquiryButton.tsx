"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NewInquiryModal } from "@/components/shared/NewInquiryModal";

/**
 * NewInquiryButton
 *
 * Thin client component that owns the open/close state for the
 * NewInquiryModal. Rendered inside the PageHeader children slot so it sits
 * alongside the existing "Book New Appointment" button.
 *
 * Only mounted on dentist / receptionist pages — patients never see it
 * (enforced by the page-level role guard and the layout middleware).
 */
export function NewInquiryButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Add New Inquiry
      </Button>

      <NewInquiryModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
