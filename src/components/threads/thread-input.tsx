"use client";
import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ThreadInputProps {
  placeholder?: string;
  submitLabel?: string;
  loadingLabel?: string;
  onSubmit: (text: string, files: File[]) => Promise<void>;
  disabled?: boolean;
  autoFocus?: boolean;
  minRows?: number;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
}

export function ThreadInput({
  placeholder = "Send a message...",
  submitLabel = "Send",
  loadingLabel = "Sending...",
  onSubmit,
  disabled,
  autoFocus,
  minRows = 2,
  textareaRef,
}: ThreadInputProps) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = (text.trim() || files.length > 0) && !submitting && !disabled;

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) return;
    if (submitting || disabled) return;

    setSubmitting(true);
    const currentFiles = [...files];
    setText("");
    setFiles([]);
    try {
      await onSubmit(trimmed, currentFiles);
    } finally {
      setSubmitting(false);
    }
  }, [text, files, submitting, disabled, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    setFiles((prev) => [...prev, ...Array.from(incoming)]);
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  return (
    <div
      className="relative"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div
        className={cn(
          "rounded-lg border transition-colors",
          dragOver
            ? "border-accent bg-accent/5"
            : "border-border bg-bg-card",
        )}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={minRows}
          disabled={disabled || submitting}
          autoFocus={autoFocus}
          className="w-full resize-none rounded-t-lg bg-transparent px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
        />

        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-2">
            {files.map((file, i) => (
              <span
                key={`${file.name}-${i}`}
                className="flex items-center gap-1 rounded-md bg-bg-hover px-2 py-1 text-xs text-text-secondary"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="shrink-0 text-text-tertiary"
                >
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <polyline points="13 2 13 9 20 9" />
                </svg>
                <span className="max-w-[120px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="ml-0.5 text-text-tertiary hover:text-text-primary"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between px-3 pb-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || submitting}
            className="rounded-md p-1.5 text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-colors disabled:opacity-50"
            title="Attach files"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-tertiary">
              {typeof navigator !== "undefined" &&
              /Mac/.test(navigator.userAgent)
                ? "\u2318"
                : "Ctrl"}
              +Enter
            </span>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? loadingLabel : submitLabel}
            </Button>
          </div>
        </div>
      </div>

      {dragOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-accent/5">
          <p className="text-sm font-medium text-accent">Drop files here</p>
        </div>
      )}
    </div>
  );
}
