"use client";

import { useState, useRef, useEffect } from "react";
import { sendPatientAssistantMessage } from "@/actions/ai";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { AIFallbackMessage } from "./AIFallbackMessage";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import type { CopilotMessage } from "@/types";

interface PatientAssistantProps {
  patientId: string;
}

/**
 * PatientAssistant
 *
 * Persistent AI Assistant chat widget — patient portal.
 * Fixed to bottom-right corner of the page.
 *
 * Architecture:
 * - Conversation history in local state (not persisted — per CLAUDE.md §8.4).
 * - Messages sent via sendPatientAssistantMessage() Server Action.
 * - Mutating actions (book/cancel/reschedule) show ConfirmDialog before executing.
 * - Graceful fallback if Gemini is unavailable.
 * - Declines medical questions with the required response per CLAUDE.md §8.4.
 */
function PatientAssistantInner({ patientId }: PatientAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // TODO: ConfirmDialog state for mutating actions
  // const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || isLoading) return;

    const userMessage: CopilotMessage = { role: "user", content: input.trim() };
    const updatedHistory = [...messages, userMessage];

    setMessages(updatedHistory);
    setInput("");
    setIsLoading(true);
    setError(null);

    const result = await sendPatientAssistantMessage(
      updatedHistory,
      userMessage.content
    );

    if (result.error) {
      setError(result.error);
    } else if (result.data) {
      setMessages([...updatedHistory, result.data]);
    }

    setIsLoading(false);
  }

  void patientId;

  return (
    <>
      {/* Floating toggle button */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center text-xl hover:bg-blue-700"
        aria-label="Open AI Assistant"
      >
        {isOpen ? "✕" : "💬"}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50 w-80 h-96 flex flex-col bg-white border rounded-xl shadow-xl overflow-hidden">
          <div className="p-3 bg-blue-600 text-white">
            <h2 className="font-semibold text-sm">DentGrow Assistant</h2>
            <p className="text-xs text-blue-200">How can I help you today?</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-xs text-gray-400 text-center mt-4">
                Ask about appointments, queue, treatments, or clinic information.
              </p>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    msg.role === "user"
                      ? "max-w-[70%] bg-blue-600 text-white rounded-lg px-3 py-2 text-xs"
                      : "max-w-[70%] bg-gray-100 text-gray-900 rounded-lg px-3 py-2 text-xs"
                  }
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg px-3 py-2 text-xs text-gray-400">
                  Thinking…
                </div>
              </div>
            )}

            {error && <AIFallbackMessage message={error} />}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-2 border-t flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type a message…"
              disabled={isLoading}
              className="flex-1 border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="px-2 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              →
            </button>
          </div>
        </div>
      )}

      {/* TODO: ConfirmDialog for mutating actions (book/reschedule/cancel) */}
      <ConfirmDialog
        open={false}
        title="Confirm Action"
        description=""
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    </>
  );
}

export function PatientAssistant({ patientId }: PatientAssistantProps) {
  return (
    <ErrorBoundary fallback={null}>
      <PatientAssistantInner patientId={patientId} />
    </ErrorBoundary>
  );
}
