"use client";

import { useState, useRef, useEffect } from "react";
import { sendPatientAssistantMessage } from "@/actions/ai";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { AIFallbackMessage } from "./AIFallbackMessage";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { Sparkles, MessageSquare, X, Send } from "lucide-react";
import type { CopilotMessage } from "@/types";

interface PatientAssistantProps {
  patientId: string;
}

function PatientAssistantInner({ patientId }: PatientAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

    const result = await sendPatientAssistantMessage(updatedHistory, userMessage.content);

    if (result.error) setError(result.error);
    else if (result.data) setMessages([...updatedHistory, result.data]);

    setIsLoading(false);
  }

  void patientId;

  return (
    <>
      {/* Floating toggle button */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-[#18181B] text-white rounded-full shadow-lg flex items-center justify-center hover:bg-[#27272A] transition-colors"
        aria-label={isOpen ? "Close AI Assistant" : "Open AI Assistant"}
      >
        {isOpen
          ? <X className="h-5 w-5" aria-hidden />
          : <MessageSquare className="h-5 w-5" aria-hidden />
        }
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50 w-80 h-[420px] flex flex-col bg-white border border-[#E4E4E7] rounded-xl shadow-2xl overflow-hidden animate-fade-in-up">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#E4E4E7] flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#71717A]" aria-hidden />
            <div>
              <h2 className="text-sm font-semibold text-[#09090B]">DentGrow Assistant</h2>
              <p className="text-xs text-[#71717A]">Ask about your appointments & visits</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-xs text-[#A1A1AA] text-center mt-4">
                Ask about appointments, queue position, treatments, or clinic information.
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
                      ? "max-w-[75%] bg-[#18181B] text-white rounded-xl rounded-br-sm px-3 py-2 text-xs"
                      : "max-w-[75%] bg-[#F4F4F5] text-[#09090B] rounded-xl rounded-bl-sm px-3 py-2 text-xs"
                  }
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-[#F4F4F5] rounded-xl rounded-bl-sm px-3 py-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A1A1AA] animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A1A1AA] animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A1A1AA] animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            {error && <AIFallbackMessage message={error} />}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-2.5 border-t border-[#E4E4E7] flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Type a message…"
              disabled={isLoading}
              aria-label="Chat message"
              className="flex-1 border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-xs text-[#09090B] placeholder:text-[#A1A1AA] outline-none focus:border-[#18181B] focus:ring-2 focus:ring-[#18181B]/10 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
              className="w-7 h-7 bg-[#18181B] text-white rounded-lg flex items-center justify-center hover:bg-[#27272A] disabled:opacity-40 transition-colors shrink-0"
            >
              <Send className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      )}

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
