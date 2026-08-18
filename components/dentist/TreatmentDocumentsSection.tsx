import { getTreatmentDocuments } from "@/actions/treatments";
import { DeleteTreatmentDocumentButton } from "@/components/dentist/DeleteTreatmentDocumentButton";
import { FileText, ImageIcon } from "lucide-react";

interface TreatmentDocumentsSectionProps {
  treatmentId: string;
  /** When false, hides delete controls (e.g. patient-facing). */
  canDelete?: boolean;
  /**
   * When true, renders nothing if there are no documents (patient portal —
   * the section is hidden entirely instead of showing an empty-state message).
   */
  hideWhenEmpty?: boolean;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * TreatmentDocumentsSection
 *
 * Server Component — lists uploaded documents for a treatment with signed
 * download links. Files are uploaded via the TreatmentForm "Documents" section.
 */
export async function TreatmentDocumentsSection({
  treatmentId,
  canDelete = true,
  hideWhenEmpty = false,
}: TreatmentDocumentsSectionProps) {
  const result = await getTreatmentDocuments(treatmentId);
  const docs = result.data ?? [];

  // Patient portal: render nothing when there are no documents.
  if (hideWhenEmpty && docs.length === 0 && !result.error) {
    return null;
  }

  return (
    <div className="bg-white border rounded-lg p-4 space-y-3">
      <h3 className="font-semibold text-gray-900 text-sm">Documents</h3>

      {result.error && <p className="text-sm text-red-600">{result.error}</p>}

      {docs.length === 0 ? (
        <p className="text-sm text-gray-500">No documents uploaded.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {docs.map((doc) => {
            const isImage = doc.file_type.startsWith("image/");
            return (
              <li key={doc.id} className="flex items-center justify-between gap-3 py-2">
                <a
                  href={doc.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 min-w-0 text-sm text-accent hover:underline"
                >
                  {isImage ? (
                    <ImageIcon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                  )}
                  <span className="truncate">{doc.file_name}</span>
                  {doc.file_size != null && (
                    <span className="text-xs text-gray-400 shrink-0">
                      {formatSize(doc.file_size)}
                    </span>
                  )}
                </a>
                {canDelete && <DeleteTreatmentDocumentButton documentId={doc.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
