"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  uploadAppointmentDocument,
  deleteAppointmentDocument,
} from "@/actions/treatments";
import { RADIOGRAPH_DOCUMENT_TYPES, type TreatmentDocument } from "@/types";
import { Select } from "@/components/ui/select";
import { FileText, ImageIcon, Upload, Trash2, Download } from "lucide-react";

type DocWithUrl = TreatmentDocument & { url: string | null };

interface RadiographicDocumentsProps {
  appointmentId: string;
  patientId: string;
  documents: DocWithUrl[];
  /** When false, upload + delete controls are hidden (view-only). */
  canManage: boolean;
}

const ACCEPTED_FILE_TYPES = ".pdf,.jpg,.jpeg,.png";
const ACCEPTED_MIME = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * RadiographicDocuments
 *
 * Appointment-scoped document manager for radiographs (IOPA / OPG / CBCT).
 * Reuses the appointment document server actions (patient-documents bucket).
 * Upload → Preview → Download → Remove. View-only when `canManage` is false.
 */
export function RadiographicDocuments({
  appointmentId,
  patientId,
  documents,
  canManage,
}: RadiographicDocumentsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [docType, setDocType] = useState<string>(RADIOGRAPH_DOCUMENT_TYPES[0]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ACCEPTED_MIME.includes(file.type)) {
      setError(`"${file.name}" is not a supported type (PDF, JPG, JPEG, PNG).`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(`"${file.name}" exceeds the 10 MB limit.`);
      return;
    }

    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("appointment_id", appointmentId);
    fd.append("patient_id", patientId);
    fd.append("document_type", docType);

    uploadAppointmentDocument(fd).then((res) => {
      setUploading(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Remove this document? This cannot be undone.")) return;
    startTransition(async () => {
      const res = await deleteAppointmentDocument(id);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="bg-white border border-[#E3E9E6] rounded-xl p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[#151918]">Radiographic Documents</h3>
        <p className="text-xs text-[#737A76] mt-0.5">
          Attach IOPA, OPG or CBCT scans (PDF, JPG, JPEG, PNG — max 10 MB each).
        </p>
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Document type"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            disabled={uploading}
            className="w-32"
          >
            {RADIOGRAPH_DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>

          <label className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-[#CBD5D0] rounded-lg cursor-pointer hover:bg-[#F6F8F6] text-[#5B635E]">
            <Upload className="h-3.5 w-3.5" aria-hidden />
            {uploading ? "Uploading…" : "Upload"}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              onChange={handleFileSelect}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
      )}

      {error && (
        <p className="text-xs text-[#DC2626]" role="alert">
          {error}
        </p>
      )}

      {documents.length === 0 ? (
        <p className="text-sm text-[#9BA39D]">No documents uploaded.</p>
      ) : (
        <ul className="divide-y divide-[#EEF2F0]">
          {documents.map((doc) => {
            const isImage = doc.file_type.startsWith("image/");
            return (
              <li key={doc.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  {isImage ? (
                    <ImageIcon className="h-4 w-4 shrink-0 text-[#9BA39D]" aria-hidden />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-[#9BA39D]" aria-hidden />
                  )}
                  {doc.document_type && (
                    <span className="shrink-0 rounded-md bg-[#EEF2F0] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#5B635E]">
                      {doc.document_type}
                    </span>
                  )}
                  <a
                    href={doc.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-sm text-[#151918] hover:underline"
                    title={doc.file_name}
                  >
                    {doc.file_name}
                  </a>
                  {doc.file_size != null && (
                    <span className="shrink-0 text-xs text-[#9BA39D]">
                      {formatSize(doc.file_size)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {doc.url && (
                    <a
                      href={doc.url}
                      download={doc.file_name}
                      className="text-[#9BA39D] hover:text-[#151918]"
                      aria-label={`Download ${doc.file_name}`}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleDelete(doc.id)}
                      disabled={isPending}
                      className="text-[#9BA39D] hover:text-[#DC2626] disabled:opacity-50"
                      aria-label={`Remove ${doc.file_name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
