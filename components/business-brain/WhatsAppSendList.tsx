"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Copy, Check, Pencil, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionDraftKind } from "@/business-brain";
import { getWhatsAppSendList, markReminderSent } from "@/actions/messaging";
import type { WhatsAppRecipient } from "@/lib/messaging/reminder-types";
import { buildWhatsAppLink } from "@/lib/messaging/whatsapp";

/** How many patients to load per page — big lists stay light, nothing is dropped. */
const PAGE_SIZE = 15;

/**
 * The per-patient send list for one reminder kind.
 *
 * Each row is one patient: their name, why they're being contacted, and the
 * message ready for them — shown as a clean preview, editable only if the staff
 * member chooses. "Open WhatsApp" opens WhatsApp addressed to them with the
 * message pre-typed; on return, "Did you send this message?" confirms it, which
 * records the send (so the same patient is not offered again) and clears the row.
 * "Skip" sets it aside for now without recording anything.
 *
 * DentGrow never sends — the person reviews and taps send in WhatsApp. The list
 * loads a page at a time so a clinic with hundreds of patients stays responsive
 * and no one is silently left off.
 */
export function WhatsAppSendList({ kind }: { kind: ActionDraftKind }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [recipients, setRecipients] = useState<WhatsAppRecipient[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  // Edited message per patient, keyed by patient id (only set once edited).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Patients handled this view — sent or skipped — filtered out of the list.
  const [handled, setHandled] = useState<Set<string>>(new Set());

  const loadPage = useCallback(
    async (offset: number) => {
      const res = await getWhatsAppSendList(kind, { limit: PAGE_SIZE, offset });
      if (res.error || !res.data) {
        setState("error");
        return;
      }
      const data = res.data;
      setTotal(data.total);
      setRecipients((prev) => (offset === 0 ? [...data.recipients] : [...prev, ...data.recipients]));
      setState("ready");
    },
    [kind],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await getWhatsAppSendList(kind, { limit: PAGE_SIZE, offset: 0 });
      if (!active) return;
      if (res.error || !res.data) {
        setState("error");
        return;
      }
      setTotal(res.data.total);
      setRecipients([...res.data.recipients]);
      setState("ready");
    })();
    return () => {
      active = false;
    };
  }, [kind]);

  const markHandled = useCallback((patientId: string) => {
    setHandled((prev) => new Set(prev).add(patientId));
  }, []);

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
  if (total === 0) {
    return <p className="text-sm text-[#71717A] px-1 py-2">No one to message right now.</p>;
  }

  const visible = recipients.filter((r) => !handled.has(r.patientId));
  const loadedCount = recipients.length;
  const remainingToLoad = Math.max(0, total - loadedCount);

  if (visible.length === 0 && remainingToLoad === 0) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-[#15803D] px-1 py-2">
        <CheckCheck className="h-4 w-4" aria-hidden />
        All caught up.
      </p>
    );
  }

  async function showMore() {
    setLoadingMore(true);
    await loadPage(loadedCount);
    setLoadingMore(false);
  }

  return (
    <div className="space-y-2.5">
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {visible.map((r) => (
          <RecipientRow
            key={r.patientId}
            kind={kind}
            recipient={r}
            message={drafts[r.patientId] ?? r.message}
            edited={drafts[r.patientId] != null}
            onMessageChange={(v) => setDrafts((d) => ({ ...d, [r.patientId]: v }))}
            onDone={() => markHandled(r.patientId)}
          />
        ))}
      </ul>

      {remainingToLoad > 0 && (
        <button
          type="button"
          onClick={showMore}
          disabled={loadingMore}
          className="w-full rounded-lg border border-[#E4E4E7] text-[#52525B] px-3 py-2 text-[13px] font-medium hover:bg-[#FAFAFA] transition-colors cursor-pointer disabled:opacity-60"
        >
          {loadingMore ? "Loading…" : `Show more (${remainingToLoad} remaining)`}
        </button>
      )}
    </div>
  );
}

function RecipientRow({
  kind,
  recipient,
  message,
  edited,
  onMessageChange,
  onDone,
}: {
  kind: ActionDraftKind;
  recipient: WhatsAppRecipient;
  message: string;
  edited: boolean;
  onMessageChange: (value: string) => void;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
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

  function leaveThen(fn: () => void) {
    setLeaving(true);
    setTimeout(fn, 550); // let the row fade before it is removed
  }

  async function confirmSent() {
    if (saving) return;
    setSaving(true);
    // Record the send so this patient is not offered again; only then drop the row.
    await markReminderSent(kind, recipient.patientId);
    setSaving(false);
    leaveThen(onDone);
  }

  return (
    <li className={cn("rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-3", leaving && "animate-complete-out")}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-[#09090B]">{recipient.name}</span>
        <span className="text-[11px] text-[#A1A1AA] shrink-0">{recipient.reason}</span>
      </div>

      {editing ? (
        <textarea
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          rows={4}
          autoFocus
          onBlur={() => setEditing(false)}
          className="mt-2 w-full resize-none rounded-md border border-[#E4E4E7] bg-white px-2.5 py-2 text-[13px] leading-relaxed text-[#52525B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181B]/15"
        />
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-[#52525B] whitespace-pre-wrap">
          {message}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-1.5 inline-flex items-center gap-1 align-baseline text-[11px] font-medium text-[#71717A] hover:text-[#18181B] transition-colors cursor-pointer"
          >
            <Pencil className="h-3 w-3" aria-hidden />
            {edited ? "Edited" : "Edit"}
          </button>
        </p>
      )}

      {awaitingConfirm ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-[#09090B]">Did you send this message?</span>
          <button
            type="button"
            onClick={confirmSent}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A34A] text-white px-3 py-1.5 text-[13px] font-medium hover:bg-[#15803D] transition-colors cursor-pointer disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            {saving ? "Saving…" : "Yes, sent"}
          </button>
          <button
            type="button"
            onClick={() => setAwaitingConfirm(false)}
            className="inline-flex items-center rounded-lg border border-[#E4E4E7] text-[#52525B] px-3 py-1.5 text-[13px] font-medium hover:bg-white transition-colors cursor-pointer"
          >
            No
          </button>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setAwaitingConfirm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A34A] text-white px-3 py-1.5 text-[13px] font-medium hover:bg-[#15803D] transition-colors cursor-pointer"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
              Open WhatsApp
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
          <button
            type="button"
            onClick={() => leaveThen(onDone)}
            className="inline-flex items-center text-[13px] font-medium text-[#71717A] hover:text-[#18181B] transition-colors cursor-pointer ml-auto"
          >
            Skip
          </button>
        </div>
      )}
    </li>
  );
}
