"use client";

import { useRef, useEffect } from "react";
import { useChat } from "ai/react";
import { Send, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatMessage } from "./ChatMessage";
import type { Coordinates } from "@/types/offers";
import { cn } from "@/lib/utils";
import { isRateLimitError, RATE_LIMIT_MESSAGE } from "@/lib/ai/errors";

interface ChatWindowProps {
  userLocation?: Coordinates;
  className?: string;
  onMessageCountChange?: (count: number) => void;
}

/**
 * Chat window component using Vercel AI SDK useChat hook.
 * Displays messages in a scrollable container with an input field at the bottom.
 * Shows streaming responses and error states.
 */
export function ChatWindow({ userLocation, className, onMessageCountChange }: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({
      api: "/api/chat",
      body: {
        userLocation,
      },
    });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Notify parent about message count changes
  useEffect(() => {
    if (onMessageCountChange) {
      onMessageCountChange(messages.length);
    }
  }, [messages.length, onMessageCountChange]);

  const isServiceUnavailable =
    error?.message?.includes("503") ||
    error?.message?.toLowerCase().includes("unavailable");

  // A rate limit is an expected condition on the free tier, not an outage,
  // so it gets its own message instead of the generic error.
  const isRateLimited = isRateLimitError(error);

  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-xl border border-border bg-background",
        className
      )}
    >
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        role="log"
        aria-label="Historia czatu"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-center">
            <p className="text-sm text-muted-foreground max-w-[280px]">
              Opisz swoje preferencje lunchowe, a pomogę Ci znaleźć idealne
              danie na dziś, jutro lub wybrany tydzień. Możesz też podać datę
              albo zakres dat.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            role={message.role as "user" | "assistant"}
            content={message.content}
          />
        ))}

        {/* Streaming indicator */}
        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            {isRateLimited
              ? RATE_LIMIT_MESSAGE
              : isServiceUnavailable
              ? "Usługa rekomendacji jest tymczasowo niedostępna. Spróbuj ponownie później."
              : "Wystąpił błąd. Spróbuj ponownie."}
          </p>
        </div>
      )}

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-border p-4"
      >
        <Input
          value={input}
          onChange={handleInputChange}
          placeholder="Opisz swoje preferencje lunchowe..."
          disabled={isLoading}
          className="flex-1 min-h-[44px]"
          aria-label="Wiadomość do czatu"
        />
        <Button
          type="submit"
          size="icon"
          disabled={isLoading || !input.trim()}
          aria-label="Wyślij wiadomość"
          className="min-h-[44px] min-w-[44px]"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
