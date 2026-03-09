"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface MessageInputProps {
  onSend: (message: string) => Promise<void>;
}

export function MessageInput({ onSend }: MessageInputProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText("");
    try {
      await onSend(trimmed);
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 border-t border-border p-4"
    >
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Send a message..."
        disabled={sending}
      />
      <Button type="submit" size="sm" disabled={!text.trim() || sending}>
        Send
      </Button>
    </form>
  );
}
