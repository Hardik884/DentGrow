"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTreatmentDocument } from "@/actions/treatments";
import { Trash2 } from "lucide-react";

interface DeleteTreatmentDocumentButtonProps {
  documentId: string;
}

export function DeleteTreatmentDocumentButton({ documentId }: DeleteTreatmentDocumentButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    startTransition(async () => {
      const res = await deleteTreatmentDocument(documentId);
      if (!res.error) router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      aria-label="Delete document"
      className="shrink-0 text-gray-400 hover:text-red-600 disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
