import { Sparkles } from "lucide-react";

interface AIFallbackMessageProps {
  message?: string;
}

export function AIFallbackMessage({
  message = "AI features are temporarily unavailable.",
}: AIFallbackMessageProps) {
  return (
    <div className="rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-xs text-warning flex items-start gap-2">
      <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
