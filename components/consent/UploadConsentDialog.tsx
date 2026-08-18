"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { uploadSignedConsent } from "@/actions/consents";
import { selectTemplateKeyForTreatmentType } from "@/lib/consents/templates";
import {
  ALLOWED_CONSENT_UPLOAD_TYPES,
  MAX_CONSENT_UPLOAD_SIZE_LABEL,
  isImageMime,
  validateConsentUpload,
} from "@/lib/consents/constants";

/** Shown for any failure that isn't a specific, actionable message. */
const UPLOAD_FAILED_MESSAGE = "Couldn't upload the consent form. Please try again.";

interface UploadConsentDialogProps {
  open: boolean;
  onClose: () => void;
  patientId: string;
  templates: { key: string; name: string }[];
  treatments: { id: string; treatment_type: string; appointment_id: string | null }[];
  onUploaded: () => void;
}

/**
 * UploadConsentDialog — attach a consent the patient signed on paper.
 * The uploaded file is stored unmodified and recorded as source='uploaded'
 * (never presented as digitally signed). Staff (dentist + receptionist) only.
 */
export function UploadConsentDialog({
  open,
  onClose,
  patientId,
  templates,
  treatments,
  onUploaded,
}: UploadConsentDialogProps) {
  const [treatmentId, setTreatmentId] = useState("");
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? "general");
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const previewUrl = useMemo(() => {
    if (file && isImageMime(file.type)) return URL.createObjectURL(file);
    return null;
  }, [file]);

  const selectedTreatment = treatments.find((t) => t.id === treatmentId) ?? null;

  function onTreatmentChange(id: string) {
    setTreatmentId(id);
    // Auto-suggest the template from the treatment type (dentist can override).
    const t = treatments.find((x) => x.id === id);
    if (t) {
      const key = selectTemplateKeyForTreatmentType(t.treatment_type);
      if (templates.some((tpl) => tpl.key === key)) setTemplateKey(key);
    }
  }

  function reset() {
    setTreatmentId("");
    setTemplateKey(templates[0]?.key ?? "general");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  /**
   * Validate at pick time so an unusable file is rejected instantly, before any
   * upload is attempted. The `accept` attribute only filters the file picker's
   * default view — it does not stop a file chosen via "All files".
   */
  function onFileChange(picked: File | null) {
    if (!picked) {
      setFile(null);
      return;
    }
    const problem = validateConsentUpload(picked);
    if (problem) {
      toast.error(problem);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(picked);
  }

  function submit() {
    if (!file) {
      toast.error("Please choose a file to upload.");
      return;
    }
    // Re-check on submit: the same validation the server will apply, in case a
    // file was set before this ran (or the limits changed under a stale tab).
    const problem = validateConsentUpload(file);
    if (problem) {
      toast.error(problem);
      return;
    }

    const fd = new FormData();
    fd.set("file", file);
    fd.set("patient_id", patientId);
    fd.set("template_key", templateKey);
    if (treatmentId) fd.set("treatment_id", treatmentId);
    if (selectedTreatment?.appointment_id) fd.set("appointment_id", selectedTreatment.appointment_id);

    startTransition(async () => {
      // A Server Action call can fail as a REJECTED PROMISE rather than an
      // { error } result — the request can be refused while its body is parsed
      // (size cap), the function can fail, or the network can drop. Unhandled,
      // that rejection escapes the transition and tears down the React tree
      // into a blank "client-side exception" screen. Catch it here so an upload
      // failure stays an upload failure.
      try {
        const res = await uploadSignedConsent(fd);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Signed consent uploaded.");
        reset();
        onUploaded();
      } catch (err) {
        // Keep the real fault in the console for debugging; show plain language.
        console.error("[UploadConsentDialog] uploadSignedConsent failed:", err);
        toast.error(UPLOAD_FAILED_MESSAGE);
      }
    });
  }

  return (
    <Dialog open={open} onClose={onClose} size="md" busy={pending} title="Upload Signed Consent"
      description="Attach a consent that was signed on paper, outside DentGrow.">
      <div className="p-5 space-y-4">
        <Field label="Treatment (optional)" htmlFor="upload-treatment"
          hint="Links the consent to the treatment and its appointment.">
          <Select id="upload-treatment" value={treatmentId} onChange={(e) => onTreatmentChange(e.target.value)}>
            <option value="">— Not linked to a treatment —</option>
            {treatments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.treatment_type}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Consent Type / Template" htmlFor="upload-template" required>
          <Select id="upload-template" value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
            {templates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Signed document" htmlFor="upload-file" required
          hint={`PDF, JPG or PNG, up to ${MAX_CONSENT_UPLOAD_SIZE_LABEL}. The original is stored unchanged.`}>
          <input
            ref={fileRef}
            id="upload-file"
            type="file"
            accept={ALLOWED_CONSENT_UPLOAD_TYPES.join(",")}
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-[#5B635E] file:mr-3 file:rounded-md file:border-0 file:bg-[#EEF2F0] file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-[#E3E9E6]"
          />
        </Field>

        {file && (
          <div className="rounded-md border border-[#E3E9E6] p-3">
            <p className="text-xs text-[#5B635E]">
              Selected: <span className="font-medium text-[#151918]">{file.name}</span>{" "}
              ({Math.round(file.size / 1024)} KB)
            </p>
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Preview" className="mt-2 max-h-48 mx-auto rounded" />
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" size="sm" onClick={submit} isLoading={pending}>
            <UploadCloud className="h-3.5 w-3.5" aria-hidden /> Upload &amp; Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
