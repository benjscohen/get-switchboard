"use client";
import { ThreadInput } from "./thread-input";

interface MessageInputProps {
  onSend: (message: string, files: File[]) => Promise<void>;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
}

export function MessageInput({ onSend, textareaRef }: MessageInputProps) {
  return (
    <div className="border-t border-border p-4">
      <ThreadInput
        onSubmit={onSend}
        placeholder="Send a follow-up..."
        submitLabel="Send"
        loadingLabel="Sending..."
        minRows={2}
        textareaRef={textareaRef}
      />
    </div>
  );
}
