import { describe, it, expect } from "vitest";
import { createMessageStream } from "./message-stream.js";
import type { PendingFollowUp } from "./session-registry.js";

function followUp(text: string): PendingFollowUp & { resolved: boolean } {
  const msg = {
    text,
    messageTs: `ts-${Date.now()}`,
    resolved: false,
    resolve() {
      this.resolved = true;
    },
  };
  return msg;
}

describe("createMessageStream", () => {
  it("yields the initial prompt as the first message", async () => {
    const stream = createMessageStream("hello world");

    // Close immediately so the generator terminates after the first yield
    stream.close();

    const messages = [];
    for await (const msg of stream.iterable) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe("user");
    expect(messages[0].message).toEqual({ role: "user", content: "hello world" });
    expect(messages[0].session_id).toBe("");
  });

  it("yields follow-up messages only after gate is opened", async () => {
    const stream = createMessageStream("initial");

    const fu1 = followUp("follow-up 1");
    const fu2 = followUp("follow-up 2");

    // Push follow-ups — they should NOT yield until gate opens
    stream.pushMessage(fu1);
    stream.pushMessage(fu2);

    const messages: Array<{ content: string | Array<unknown> }> = [];
    const done = (async () => {
      for await (const msg of stream.iterable) {
        messages.push({ content: msg.message.content });
      }
    })();

    // Wait for initial message to yield
    await new Promise((r) => setTimeout(r, 10));
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("initial");

    // Follow-ups should NOT have been yielded yet — gate is closed
    expect(fu1.resolved).toBe(false);
    expect(fu2.resolved).toBe(false);

    // Open gate — first follow-up should yield
    stream.openGate();
    await new Promise((r) => setTimeout(r, 10));
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toBe("follow-up 1");
    expect(fu1.resolved).toBe(true);
    // Second follow-up still blocked — gate closed after yielding first
    expect(fu2.resolved).toBe(false);

    // Open gate again for second follow-up
    stream.openGate();
    await new Promise((r) => setTimeout(r, 10));
    expect(messages).toHaveLength(3);
    expect(messages[2].content).toBe("follow-up 2");
    expect(fu2.resolved).toBe(true);

    stream.close();
    await done;
  });

  it("pushMessage returns false after close", () => {
    const stream = createMessageStream("x");
    stream.close();
    const msg = followUp("late");
    expect(stream.pushMessage(msg)).toBe(false);
    expect(msg.resolved).toBe(false);
  });

  it("setSessionId updates session_id on subsequent messages", async () => {
    const stream = createMessageStream("first");

    const messages: Array<{ session_id: string; content: string | Array<unknown> }> = [];

    // Consume in background so we can push mid-stream
    const done = (async () => {
      for await (const msg of stream.iterable) {
        messages.push({ session_id: msg.session_id, content: msg.message.content });
      }
    })();

    // Wait for initial message to be yielded (session_id still "")
    await new Promise((r) => setTimeout(r, 10));
    expect(messages).toHaveLength(1);
    expect(messages[0].session_id).toBe("");

    // Now set session ID, open gate, and push a follow-up
    stream.setSessionId("claude-sess-abc");
    stream.openGate();
    const fu = followUp("second");
    stream.pushMessage(fu);

    await new Promise((r) => setTimeout(r, 10));
    expect(messages).toHaveLength(2);
    expect(messages[1].session_id).toBe("claude-sess-abc");

    stream.close();
    await done;
  });

  it("openGate when gate already open + message waiting → immediate yield", async () => {
    const stream = createMessageStream("init");

    const messages: Array<{ content: string | Array<unknown> }> = [];
    const done = (async () => {
      for await (const msg of stream.iterable) {
        messages.push({ content: msg.message.content });
      }
    })();

    await new Promise((r) => setTimeout(r, 10));
    expect(messages).toHaveLength(1);

    // Open gate first, then push — message should yield immediately
    stream.openGate();
    const fu = followUp("immediate");
    stream.pushMessage(fu);

    await new Promise((r) => setTimeout(r, 10));
    expect(messages).toHaveLength(2);
    expect(fu.resolved).toBe(true);

    stream.close();
    await done;
  });

  it("close while gate is closed drains remaining messages", async () => {
    const stream = createMessageStream("init");

    const messages: Array<{ content: string | Array<unknown> }> = [];
    const done = (async () => {
      for await (const msg of stream.iterable) {
        messages.push({ content: msg.message.content });
      }
    })();

    await new Promise((r) => setTimeout(r, 10));
    expect(messages).toHaveLength(1);

    // Push messages while gate is closed, then close
    const fu1 = followUp("drain-1");
    const fu2 = followUp("drain-2");
    stream.pushMessage(fu1);
    stream.pushMessage(fu2);
    stream.close();

    await done;

    // Should have initial + drained messages
    expect(messages).toHaveLength(3);
    expect(messages[1].content).toBe("drain-1");
    expect(messages[2].content).toBe("drain-2");
    expect(fu1.resolved).toBe(true);
    expect(fu2.resolved).toBe(true);
  });

  it("getState returns correct values", async () => {
    const stream = createMessageStream("init");

    // Initially: gate closed, queue empty, not closed
    expect(stream.getState()).toEqual({
      queueLength: 0,
      gateOpen: false,
      closed: false,
    });

    // Push a message — queue should grow
    const fu = followUp("queued");
    stream.pushMessage(fu);
    expect(stream.getState()).toEqual({
      queueLength: 1,
      gateOpen: false,
      closed: false,
    });

    // Open gate
    stream.openGate();
    expect(stream.getState().gateOpen).toBe(true);

    // Close
    stream.close();
    expect(stream.getState().closed).toBe(true);
  });

  it("handles push while generator is waiting with gate open", async () => {
    const stream = createMessageStream("init");

    // Collect messages in the background
    const messages: Array<{ content: string | Array<unknown> }> = [];
    const done = (async () => {
      for await (const msg of stream.iterable) {
        messages.push({ content: msg.message.content });
      }
    })();

    // Give the generator time to yield the first message and then block
    await new Promise((r) => setTimeout(r, 10));
    expect(messages).toHaveLength(1);

    // Open gate, then push a follow-up while generator is waiting
    stream.openGate();
    const fu = followUp("async follow-up");
    expect(stream.pushMessage(fu)).toBe(true);

    // Wait a tick for it to be yielded
    await new Promise((r) => setTimeout(r, 10));
    expect(messages).toHaveLength(2);
    expect(fu.resolved).toBe(true);

    stream.close();
    await done;
    expect(messages).toHaveLength(2);
  });
});
