"use client";

import { useState, useEffect } from "react";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { useGeolocation } from "@/hooks/useGeolocation";
import { MessageSquare, MapPin } from "lucide-react";

const MAX_MESSAGES = 50;

export default function ChatPage() {
  const { coordinates } = useGeolocation();
  const [messageCount, setMessageCount] = useState(0);

  // Listen for message count changes via a custom event or polling the ChatWindow
  // We'll track user messages by intercepting the chat state
  const limitReached = messageCount >= MAX_MESSAGES;

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col px-4 py-4 md:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-semibold tracking-tight">
            Rekomendacje AI
          </h1>
        </div>

        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {/* Location indicator */}
          {coordinates && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Lokalizacja aktywna</span>
            </span>
          )}

          {/* Message counter */}
          <span
            className={`rounded-md px-2 py-0.5 font-medium ${
              limitReached
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground"
            }`}
            aria-label={`Wykorzystano ${messageCount} z ${MAX_MESSAGES} wiadomości`}
          >
            {messageCount}/{MAX_MESSAGES} wiadomości
          </span>
        </div>
      </div>

      {/* Chat window - fills remaining space */}
      <div className="min-h-0 flex-1">
        <ChatWindow
          userLocation={coordinates ?? undefined}
          className="h-full"
          onMessageCountChange={setMessageCount}
        />
      </div>
    </div>
  );
}
