"use client";

import { useState, useRef, useEffect } from "react";
import { sendCopilotMessage } from "@/actions/ai";
import { AIFallbackMessage } from "./AIFallbackMessage";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import type { CopilotMessage } from "@/types";

/**
 * CopilotChat
 *
 * Clinic Copilot chat panel — dentist + receptionist dashboards.
 *
 * Architecture:
 * - Conversation history in local component state (not persisted — per CLAUDE.md §8.2).
 * - Messages sent via sendCopilotMessage() Server Action.
 * - Mutating actions require explicit user confirmation before execution.
 * - Graceful fallback if Gemini is unavailable.
 */
function CopilotChatInner() {
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

    const result = await sendCopilotMessage(updatedHistory, userMessage.content);

    if (result.error) {
      setError(result.error);
    } else if (result.data) {
      setMessages([...updatedHistory, result.data]);
    }

    setIsLoading(false);
  }

  return (
    <div className="flex flex-col h-full bg-white border rounded-lg overflow-hidden">
      <div className="p-3 border-b bg-gray-50">
        <h2 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
          <span>🤖</span> Clinic Copilot
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center mt-4">
            Ask me about today&apos;s appointments, payments, or patient history.
          </p>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={
              msg.role === "user"
                ? "flex justify-end"
                : "flex justify-start"
            }
          >
            <div
              className={
                msg.role === "user"
                  ? "max-w-xs bg-blue-600 text-white rounded-lg px-3 py-2 text-sm"
                  : "max-w-xs bg-gray-100 text-gray-900 rounded-lg px-3 py-2 text-sm"
              }
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-400">
              Thinking…
            </div>
          </div>
        )}

        {error && <AIFallbackMessage message={error} />}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask the copilot…"
          disabled={isLoading}
          className="flex-1 border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export function CopilotChat() {
  return (
    <ErrorBoundary
      fallback={
        <AIFallbackMessage message="The AI assistant is temporarily unavailable." />
      }
    >
      <CopilotChatInner />
    </ErrorBoundary>
  );
}
