"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Copy, Check } from "lucide-react";
import type { ActionDraftKind } from "@/business-brain";
import { getWhatsAppSendList, type WhatsAppRecipient } from "@/actions/messaging";
import { buildWhatsAppLink } from "@/lib/messaging/whatsapp";

/**
 * The per-patient WhatsApp send list, shown when a staff member expands a
 * Morning Briefing action card. Each row is one patient: their name, the message
 * ready for them (editable before sending), and a button that opens WhatsApp
 * addressed to them with the message pre-typed. DentGrow never sends — the
 * person reviews and taps send in WhatsApp.
 */
export function WhatsAppSendList({ kind }: { kind: ActionDraftKind }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [recipients, setRecipients] = useState<readonly WhatsAppRecipient[]>([]);
  // Editable message per patient, keyed by patient id.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    getWhatsAppSendList(kind).then((res) => {
      if (!active) return;
      if (res.error || !res.data) {
        setState("error");
        return;
      }
      setRecipients(res.data.recipients);
      setDrafts(Object.fromEntries(res.data.recipients.map((r) => [r.patientId, r.message])));
      setState("ready");
    });
    return () => {
      active = false;
    };
  }, [kind]);

  if (state === "loading") {
    return <p className="text-sm text-[#A1A1AA] px-1 py-2">Loading patients…</p>;
  }
  if (state === "error") {
    return (
      <p className="text-sm text-[#B45309] px-1 py-2">
        Couldn&apos;t load the list right now. The rest of DentGrow still works.
      </p>
    );
  }
  if (recipients.length === 0) {
    return <p className="text-sm text-[#71717A] px-1 py-2">No one to message right now.</p>;
  }

  return (
    <ul className="space-y-2.5">
      {recipients.map((r) => (
        <RecipientRow
          key={r.patientId}
          recipient={r}
          message={drafts[r.patientId] ?? r.message}
          onMessageChange={(v) => setDrafts((d) => ({ ...d, [r.patientId]: v }))}
        />
      ))}
    </ul>
  );
}

function RecipientRow({
  recipient,
  message,
  onMessageChange,
}: {
  recipient: WhatsAppRecipient;
  message: string;
  onMessageChange: (value: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const link = buildWhatsAppLink(recipient.phone, message);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (permissions / insecure context); no-op.
    }
  }

  return (
    <li className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-[#09090B]">{recipient.name}</span>
        {!link && (
          <span className="text-[11px] text-[#A1A1AA]">No phone on file</span>
        )}
      </div>
      <textarea
        value={message}
        onChange={(e) => onMessageChange(e.target.value)}
        rows={3}
        className="mt-2 w-full resize-none rounded-md border border-[#E4E4E7] bg-white px-2.5 py-2 text-[13px] leading-relaxed text-[#52525B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181B]/15"
      />
      <div className="mt-2 flex items-center gap-2">
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A34A] text-white px-3 py-1.5 text-[13px] font-medium hover:bg-[#15803D] transition-colors cursor-pointer"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            Send on WhatsApp
          </a>
        ) : (
          <span className="text-[13px] text-[#A1A1AA]">Add a phone number to message this patient.</span>
        )}
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] text-[#52525B] px-3 py-1.5 text-[13px] font-medium hover:bg-white transition-colors cursor-pointer"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#16A34A]" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </li>
  );
}
