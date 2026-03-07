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

  it("yields follow-up messages pushed before close", async () => {
    const stream = createMessageStream("initial");

    const fu1 = followUp("follow-up 1");
    const fu2 = followUp("follow-up 2");

    // Push follow-ups — they'll be yielded after the initial message
    stream.pushMessage(fu1);
    stream.pushMessage(fu2);
    stream.close();

    const messages = [];
    for await (const msg of stream.iterable) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(3);
    expect(messages[0].message.content).toBe("initial");
    expect(messages[1].message.content).toBe("follow-up 1");
    expect(messages[2].message.content).toBe("follow-up 2");
    expect(fu1.resolved).toBe(true);
    expect(fu2.resolved).toBe(true);
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

    // Now set session ID and push a follow-up
    stream.setSessionId("claude-sess-abc");
    const fu = followUp("second");
    stream.pushMessage(fu);

    await new Promise((r) => setTimeout(r, 10));
    expect(messages).toHaveLength(2);
    expect(messages[1].session_id).toBe("claude-sess-abc");

    stream.close();
    await done;
  });

  it("handles push while generator is waiting", async () => {
    const stream = createMessageStream("init");

    // Collect messages in the background
    const messages: Array<{ content: string | Array<unknown> }> = [];
    const done = (async () => {
      for await (const msg of stream.iterable) {
        messages.push({ content: msg.message.content });
      }
    })();

    // Give the generator time to yield the first message and then block waiting
    await new Promise((r) => setTimeout(r, 10));
    expect(messages).toHaveLength(1);

    // Push a follow-up while generator is waiting
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
