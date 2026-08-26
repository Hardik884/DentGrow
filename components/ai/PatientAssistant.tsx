"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { sendPatientAssistantMessage } from "@/actions/ai";
import { AIFallbackMessage } from "./AIFallbackMessage";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import {
  Sparkles,
  X,
  Send,
  Bot,
  Minimize2,
  ChevronDown,
} from "lucide-react";
import type { CopilotMessage } from "@/types";
import { isPatientBookingEnabled } from "@/lib/feature-flags";

// ── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-surface-muted rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-1">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="w-1.5 h-1.5 rounded-full bg-text-disabled animate-bounce [animation-duration:1s]"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: CopilotMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} group`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center mr-2 mt-0.5 shrink-0">
          <Bot className="h-3 w-3 text-accent-foreground" aria-hidden />
        </div>
      )}
      <div
        className={
          isUser
            ? "max-w-[78%] bg-accent text-accent-foreground rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm leading-relaxed"
            : "max-w-[82%] bg-surface-muted text-text-primary rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed"
        }
      >
        {msg.content}
      </div>
    </div>
  );
}

// ── Suggested prompts ─────────────────────────────────────────────────────────

// Booking-related prompts are only surfaced when patient booking is enabled,
// so the assistant never advertises an action it will immediately refuse.
const SUGGESTED_PROMPTS = [
  ...(isPatientBookingEnabled() ? ["What slots are available tomorrow?"] : []),
  "What are the clinic hours?",
  "Do I have any upcoming appointments?",
  "What's my queue position?",
];

function SuggestedPrompts({ onSelect }: { onSelect: (p: string) => void }) {
  return (
    <div className="px-3 pb-2 flex flex-wrap gap-1.5">
      {SUGGESTED_PROMPTS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onSelect(p)}
          className="text-[11px] px-2.5 py-1 rounded-full border border-border text-text-body hover:border-accent hover:text-text-primary transition-colors bg-surface"
        >
          {p}
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface PatientAssistantProps {
  patientId: string;
}

function PatientAssistantInner({ patientId }: PatientAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  void patientId;

  // Auto-scroll to bottom
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, isOpen, isMinimized]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setUnreadCount(0);
    }
  }, [isOpen, isMinimized]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSend = useCallback(
    async (overrideMessage?: string) => {
      const text = (overrideMessage ?? input).trim();
      if (!text || isLoading) return;

      const userMessage: CopilotMessage = { role: "user", content: text };
      const updatedHistory = [...messages, userMessage];

      setMessages(updatedHistory);
      setInput("");
      setIsLoading(true);
      setError(null);
      setShowSuggestions(false);

      const result = await sendPatientAssistantMessage(
        updatedHistory,
        userMessage.content
      );

      setIsLoading(false);

      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        setMessages([...updatedHistory, result.data]);
        if (!isOpen || isMinimized) {
          setUnreadCount((c) => c + 1);
        }
      }
    },
    [input, isLoading, messages, isOpen, isMinimized]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleOpen() {
    setIsOpen(true);
    setIsMinimized(false);
    setUnreadCount(0);
  }

  function handleClose() {
    setIsOpen(false);
    setIsMinimized(false);
  }

  function handleMinimize() {
    setIsMinimized(true);
  }

  function handleRestore() {
    setIsMinimized(false);
    setUnreadCount(0);
  }

  // ── Floating button (when closed) ─────────────────────────────────────────
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Open AI Assistant"
        className="fixed bottom-18 right-4 sm:bottom-6 sm:right-6 z-40 w-[52px] h-[52px] bg-accent text-accent-foreground rounded-full shadow-xl flex items-center justify-center hover:bg-accent-hover active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <div className="relative">
          <Bot className="h-5 w-5" aria-hidden />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-danger text-danger-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>
      </button>
    );
  }

  // ── Minimized pill ────────────────────────────────────────────────────────
  if (isOpen && isMinimized) {
    return (
      <div className="fixed bottom-[4.5rem] right-4 sm:bottom-6 sm:right-6 z-40">
        <button
          type="button"
          onClick={handleRestore}
          className="flex items-center gap-2 bg-accent text-accent-foreground rounded-full shadow-xl px-4 py-2.5 hover:bg-accent-hover active:scale-95 transition-all"
          aria-label="Restore AI Assistant"
        >
          <Bot className="h-4 w-4" aria-hidden />
          <span className="text-xs font-medium">OraMedha Assistant</span>
          {unreadCount > 0 && (
            <span className="w-5 h-5 bg-danger text-danger-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 rotate-180" aria-hidden />
        </button>
      </div>
    );
  }

  // ── Full chat panel ──────────────────────────────────────────────────────
  return (
    <>
      {/* Chat panel
          On mobile: full-width, sits above the bottom nav bar (bottom: 4.5rem = 72px)
          On desktop: fixed bottom-right, 380px wide
      */}
      <div
        role="dialog"
        aria-label="OraMedha AI Assistant"
        aria-modal="false"
        className={[
          "fixed z-40 flex flex-col bg-surface border border-border shadow-2xl overflow-hidden",
          // Mobile: full width, above bottom tab bar
          "bottom-[4.5rem] left-2 right-2 rounded-2xl",
          // Desktop: fixed position bottom-right
          "sm:bottom-6 sm:left-auto sm:right-6 sm:w-[380px] sm:rounded-2xl",
          // Height: fills available space on mobile, fixed on desktop
          "h-[calc(100dvh-8rem)] sm:h-[560px]",
        ].join(" ")}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-2.5 shrink-0 bg-accent rounded-t-2xl">
          <div className="w-8 h-8 rounded-full bg-accent-foreground/15 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-accent-foreground" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-accent-foreground leading-none">
              OraMedha Assistant
            </h2>
            <p className="text-[11px] text-accent-foreground/70 mt-0.5">
              Ask about appointments, hours &amp; more
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleMinimize}
              aria-label="Minimize"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-accent-foreground/70 hover:text-accent-foreground hover:bg-accent-foreground/15 transition-colors"
            >
              <Minimize2 className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close assistant"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-accent-foreground/70 hover:text-accent-foreground hover:bg-accent-foreground/15 transition-colors"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* ── Messages area ───────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-3.5 py-3 space-y-3"
          aria-live="polite"
          aria-atomic="false"
        >
          {/* Welcome state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center text-center pt-4 pb-2 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-surface-muted flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-text-secondary" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  Hi! I&apos;m your dental assistant.
                </p>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                  {isPatientBookingEnabled()
                    ? "I can help you book appointments, check clinic hours, view your queue status, and more."
                    : "I can help you check clinic hours, view your queue status, see your appointments, and more."}
                </p>
              </div>
            </div>
          )}

          {/* Message bubbles */}
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}

          {/* Loading indicator */}
          {isLoading && <TypingIndicator />}

          {/* Error */}
          {error && <AIFallbackMessage message={error} />}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Suggested prompts (shown when no messages) ──────────────── */}
        {messages.length === 0 && showSuggestions && (
          <SuggestedPrompts onSelect={(p) => handleSend(p)} />
        )}

        {/* ── Input area ──────────────────────────────────────────────── */}
        <div className="px-3 py-2.5 border-t border-border flex items-end gap-2 shrink-0 bg-surface">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything…"
            disabled={isLoading}
            aria-label="Chat message"
            rows={1}
            maxLength={500}
            className="flex-1 border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:opacity-50 resize-none min-h-[38px] max-h-[100px] overflow-y-auto leading-snug"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            aria-label="Send message"
            className="w-9 h-9 bg-accent text-accent-foreground rounded-xl flex items-center justify-center hover:bg-accent-hover disabled:opacity-40 active:scale-95 transition-all shrink-0 self-end"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
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
