"use client";
import { ThreadInput } from "./thread-input";

interface MessageInputProps {
  onSend: (message: string, files: File[]) => Promise<void>;
}

export function MessageInput({ onSend }: MessageInputProps) {
  return (
    <div className="border-t border-border p-4">
      <ThreadInput
        onSubmit={onSend}
        placeholder="Send a follow-up..."
        submitLabel="Send"
        loadingLabel="Sending..."
        minRows={2}
      />
    </div>
  );
}
