// ---------------------------------------------------------------------------
// Async-iterable message stream for multi-turn Claude Code SDK conversations
//
// Creates an AsyncIterable<SDKUserMessage> that:
//   1. Yields the initial user message immediately
//   2. Gates follow-ups — they queue until openGate() is called (SDK finished its turn)
//   3. Terminates when close() is called
// ---------------------------------------------------------------------------

import type { SDKUserMessage } from "@anthropic-ai/claude-code";
import type { PendingFollowUp } from "./session-registry.js";

export interface MessageStreamState {
  queueLength: number;
  gateOpen: boolean;
  closed: boolean;
}

export interface MessageStream {
  iterable: AsyncIterable<SDKUserMessage>;
  pushMessage: (msg: PendingFollowUp) => boolean;
  close: () => void;
  setSessionId: (id: string) => void;
  openGate: () => void;
  getState: () => MessageStreamState;
}

export function createMessageStream(initialPrompt: string): MessageStream {
  let sessionId = "";
  let closed = false;

  // Gate: starts closed after the initial prompt is yielded.
  // Follow-ups are buffered until openGate() is called (SDK finished its turn).
  let gateOpen = false;
  let gateNotify: (() => void) | null = null;

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
    // Wake any pending waits so the generator can return
    if (notify) {
      notify();
      notify = null;
    }
    if (gateNotify) {
      gateNotify();
      gateNotify = null;
    }
  }

  function setSessionId(id: string): void {
    sessionId = id;
  }

  function openGate(): void {
    gateOpen = true;
    console.log(`[message-stream] gate opened — queued=${queue.length}`);
    if (gateNotify) {
      gateNotify();
      gateNotify = null;
    }
  }

  function getState(): MessageStreamState {
    return { queueLength: queue.length, gateOpen, closed };
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

    // Then wait for gate + follow-ups
    while (!closed) {
      // Wait for gate to open (SDK ready for next turn)
      while (!gateOpen && !closed) {
        await new Promise<void>((resolve) => {
          gateNotify = resolve;
        });
      }
      if (closed) break;

      // Wait for a queued message
      while (queue.length === 0 && !closed) {
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
      }
      if (closed) break;

      // Close gate — SDK will be busy processing this message
      gateOpen = false;
      const msg = queue.shift()!;
      msg.resolve();
      console.log(`[message-stream] yielding gated follow-up — remaining=${queue.length}`);
      yield buildSDKMessage(msg.text);
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
    openGate,
    getState,
  };
}
