"use client";

import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  className?: string;
}

/**
 * Renders basic markdown-like formatting for assistant messages.
 * Supports: **bold**, bullet lists (lines starting with - or *).
 */
function formatAssistantContent(content: string): React.ReactNode[] {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Bullet list items
    if (/^\s*[-*]\s+/.test(line)) {
      const text = line.replace(/^\s*[-*]\s+/, "");
      elements.push(
        <li key={i} className="ml-4 list-disc">
          {renderInlineFormatting(text)}
        </li>
      );
      continue;
    }

    // Empty lines become spacing
    if (line.trim() === "") {
      elements.push(<br key={i} />);
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="leading-relaxed">
        {renderInlineFormatting(line)}
      </p>
    );
  }

  return elements;
}

/**
 * Renders inline formatting: **bold** text.
 */
function renderInlineFormatting(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

/**
 * Renders a single chat message.
 * User messages are right-aligned with primary color background.
 * Assistant messages are left-aligned with muted background.
 */
export function ChatMessage({ role, content, className }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row",
        className
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
        aria-hidden="true"
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Message bubble */}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md"
        )}
      >
        {isUser ? (
          <p className="leading-relaxed whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="space-y-1">{formatAssistantContent(content)}</div>
        )}
      </div>
    </div>
  );
}
