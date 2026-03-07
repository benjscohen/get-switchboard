// ---------------------------------------------------------------------------
// Async-iterable message stream for multi-turn Claude Code SDK conversations
//
// Creates an AsyncIterable<SDKUserMessage> that:
//   1. Yields the initial user message immediately
//   2. Waits for follow-ups pushed via pushMessage()
//   3. Terminates when close() is called
// ---------------------------------------------------------------------------

import type { SDKUserMessage } from "@anthropic-ai/claude-code";
import type { PendingFollowUp } from "./session-registry.js";

export interface MessageStream {
  iterable: AsyncIterable<SDKUserMessage>;
  pushMessage: (msg: PendingFollowUp) => boolean;
  close: () => void;
  setSessionId: (id: string) => void;
}

export function createMessageStream(initialPrompt: string): MessageStream {
  let sessionId = "";
  let closed = false;

  // Queue of pending follow-ups + a notify mechanism
  const queue: PendingFollowUp[] = [];
  let notify: (() => void) | null = null;

  function pushMessage(msg: PendingFollowUp): boolean {
    if (closed) return false;
    queue.push(msg);
    if (notify) {
      notify();
      notify = null;
    }
    return true;
  }

  function close(): void {
    closed = true;
    // Wake any pending wait so the generator can return
    if (notify) {
      notify();
      notify = null;
    }
  }

  function setSessionId(id: string): void {
    sessionId = id;
  }

  function buildSDKMessage(text: string): SDKUserMessage {
    return {
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
      session_id: sessionId,
    };
  }

  async function* generator(): AsyncGenerator<SDKUserMessage, void> {
    // Yield the initial prompt immediately
    yield buildSDKMessage(initialPrompt);

    // Then wait for follow-ups
    while (!closed) {
      if (queue.length > 0) {
        const msg = queue.shift()!;
        msg.resolve();
        yield buildSDKMessage(msg.text);
      } else {
        // Wait for a push or close
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
      }
    }

    // Drain any remaining queued messages before returning
    while (queue.length > 0) {
      const msg = queue.shift()!;
      msg.resolve();
      yield buildSDKMessage(msg.text);
    }
  }

  return {
    iterable: generator(),
    pushMessage,
    close,
    setSessionId,
  };
}
