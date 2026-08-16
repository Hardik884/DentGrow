"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { PenLine, FileCheck2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/utils";
import { getConsentTemplateContent, updateConsentTemplate, type ClinicConsentTemplate } from "@/actions/consent-templates";
import type { ConsentContent } from "@/lib/consents/content";

interface ConsentTemplateManagerProps {
  templates: ClinicConsentTemplate[];
}

/**
 * ConsentTemplateManager — clinic-owned consent template management (dentist).
 * Editing a template creates a NEW version via updateConsentTemplate; existing
 * signed consents are never affected.
 */
export function ConsentTemplateManager({ templates }: ConsentTemplateManagerProps) {
  const router = useRouter();
  const [editKey, setEditKey] = useState<string | null>(null);
  const editing = templates.find((t) => t.template_key === editKey) ?? null;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-[#E4E4E7] bg-[#FAFAFA] px-4 py-3">
        <p className="text-xs text-[#52525B]">
          These are your clinic&apos;s consent templates. They are a starting point —{" "}
          <strong>review and approve the wording</strong> (with legal counsel where appropriate)
          before using them with patients. Editing a template creates a new version; consents
          already signed keep the exact version they were signed with.
        </p>
      </div>

      <ul className="divide-y divide-[#F4F4F5] rounded-lg border border-[#E4E4E7]">
        {templates.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-[#09090B] truncate">{t.name}</p>
                {!t.is_active && <StatusBadge label="Inactive" variant="default" />}
              </div>
              <p className="text-xs text-[#71717A] mt-0.5">
                Version {t.current_version} · Last updated {formatDate(t.updated_at)}
                {t.consent_required ? " · Required by default" : ""}
              </p>
            </div>
            <Button variant="outline" size="xs" onClick={() => setEditKey(t.template_key)}>
              <PenLine className="h-3 w-3" aria-hidden /> Edit
            </Button>
          </li>
        ))}
      </ul>

      {editing && (
        <TemplateEditDialog
          template={editing}
          onClose={() => setEditKey(null)}
          onSaved={() => {
            setEditKey(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function TemplateEditDialog({
  template,
  onClose,
  onSaved,
}: {
  template: ClinicConsentTemplate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState<ConsentContent | null>(null);
  const [name, setName] = useState(template.name);
  const [required, setRequired] = useState(template.consent_required);
  const [pending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    getConsentTemplateContent({ templateKey: template.template_key }).then((res) => {
      if (res.data) setContent(res.data.content);
      setLoaded(true);
    });
  }

  function updateSection(idx: number, patch: Partial<{ title: string; body: string }>) {
    setContent((c) =>
      c
        ? { ...c, sections: c.sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)) }
        : c
    );
  }

  function save() {
    if (!content) return;
    startTransition(async () => {
      const res = await updateConsentTemplate({
        template_id: template.id,
        name,
        consent_required: required,
        content,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Saved as version ${res.data?.current_version}.`);
      onSaved();
    });
  }

  return (
    <Dialog open onClose={onClose} size="xl" busy={pending} title={`Edit: ${template.name}`}
      description="Saving creates a new version. Signed consents are not affected.">
      <div className="p-5 space-y-4">
        {!loaded && <p className="text-sm text-[#71717A]">Loading…</p>}
        {loaded && !content && <p className="text-sm text-red-600">Could not load template content.</p>}
        {content && (
          <>
            <Field label="Template name" htmlFor="tpl-name">
              <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>

            <label className="flex items-center gap-2 text-sm text-[#3F3F46]">
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
              Recommend consent by default for matching treatments
            </label>

            <div className="space-y-3 border-t border-[#F4F4F5] pt-3">
              {content.sections.map((s, i) => (
                <div key={s.key} className="space-y-1">
                  <Input
                    value={s.title}
                    onChange={(e) => updateSection(i, { title: e.target.value })}
                    className="font-medium"
                  />
                  <Textarea
                    rows={2}
                    value={s.body}
                    onChange={(e) => updateSection(i, { body: e.target.value })}
                    placeholder={s.editablePerConsent ? "Editable per consent" : "Fixed statement"}
                  />
                </div>
              ))}
            </div>

            <Field label="Clinic disclaimer" htmlFor="tpl-disclaimer">
              <Textarea
                id="tpl-disclaimer"
                rows={3}
                value={content.disclaimer}
                onChange={(e) => setContent((c) => (c ? { ...c, disclaimer: e.target.value } : c))}
              />
            </Field>

            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="default" size="sm" onClick={save} isLoading={pending}>
                <FileCheck2 className="h-3.5 w-3.5" aria-hidden /> Save New Version
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
