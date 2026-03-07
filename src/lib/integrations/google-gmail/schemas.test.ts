import {
  messageId,
  threadId,
  pageToken,
  maxResults,
  labelIds,
  compositionFields,
  attachmentItem,
  attachmentsField,
  listMessagesSchema,
  getMessageSchema,
  getAttachmentSchema,
  sendMessageSchema,
  replyToMessageSchema,
  forwardMessageSchema,
  modifyMessageSchema,
  trashMessageSchema,
  batchModifyMessagesSchema,
  listThreadsSchema,
  getThreadSchema,
  manageDraftsSchema,
  manageLabelsSchema,
  manageVacationSchema,
  manageFiltersSchema,
  getProfileSchema,
  listHistorySchema,
} from "./schemas";
import { GMAIL_TOOLS, buildMimeMessage, plaintextToHtml, encodeRfc2047 } from "./tools";

// ── Tool count ──

describe("tool count", () => {
  it("exports exactly 17 tools", () => {
    expect(GMAIL_TOOLS).toHaveLength(17);
  });
});

// ── Shared fragments ──

describe("shared fragments", () => {
  it("messageId requires a string", () => {
    expect(() => messageId.parse(undefined)).toThrow();
    expect(messageId.parse("msg-123")).toBe("msg-123");
  });

  it("threadId requires a string", () => {
    expect(() => threadId.parse(undefined)).toThrow();
    expect(threadId.parse("thread-456")).toBe("thread-456");
  });

  it("pageToken is optional", () => {
    expect(pageToken.parse(undefined)).toBeUndefined();
    expect(pageToken.parse("token123")).toBe("token123");
  });

  it("maxResults is optional", () => {
    expect(maxResults.parse(undefined)).toBeUndefined();
    expect(maxResults.parse(25)).toBe(25);
  });

  it("labelIds is optional string", () => {
    expect(labelIds.parse(undefined)).toBeUndefined();
    expect(labelIds.parse("INBOX,UNREAD")).toBe("INBOX,UNREAD");
  });

  it("compositionFields has required to, subject, body", () => {
    const schema = sendMessageSchema; // uses ...compositionFields
    expect(() => schema.parse({})).toThrow();
    expect(() => schema.parse({ to: "a@b.com" })).toThrow();
    expect(() => schema.parse({ to: "a@b.com", subject: "hi" })).toThrow();
    const result = schema.parse({
      to: "a@b.com",
      subject: "hi",
      body: "hello",
    });
    expect(result.to).toBe("a@b.com");
  });

  it("compositionFields has optional cc, bcc, contentType", () => {
    const result = sendMessageSchema.parse({
      to: "a@b.com",
      subject: "hi",
      body: "hello",
      cc: "c@d.com",
      bcc: "e@f.com",
      contentType: "text/html",
    });
    expect(result.cc).toBe("c@d.com");
    expect(result.bcc).toBe("e@f.com");
    expect(result.contentType).toBe("text/html");
  });

  it.each(["text/plain", "text/html"] as const)(
    "compositionFields accepts contentType '%s'",
    (ct) => {
      const result = sendMessageSchema.parse({
        to: "a@b.com",
        subject: "hi",
        body: "hello",
        contentType: ct,
      });
      expect(result.contentType).toBe(ct);
    }
  );

  it("compositionFields rejects invalid contentType", () => {
    expect(() =>
      sendMessageSchema.parse({
        to: "a@b.com",
        subject: "hi",
        body: "hello",
        contentType: "text/xml",
      })
    ).toThrow();
  });
});

// ── Message schemas ──

describe("message schemas", () => {
  describe("listMessagesSchema", () => {
    it("accepts empty object (all optional)", () => {
      const result = listMessagesSchema.parse({});
      expect(result).toBeDefined();
    });

    it("accepts full valid input", () => {
      const result = listMessagesSchema.parse({
        q: "from:alice subject:report",
        labelIds: "INBOX",
        maxResults: 50,
        pageToken: "abc",
        includeSpamTrash: true,
      });
      expect(result.q).toBe("from:alice subject:report");
      expect(result.maxResults).toBe(50);
    });
  });

  describe("getMessageSchema", () => {
    it("requires messageId", () => {
      expect(() => getMessageSchema.parse({})).toThrow();
    });

    it("accepts valid input", () => {
      const result = getMessageSchema.parse({ messageId: "m1" });
      expect(result.messageId).toBe("m1");
    });

    it.each(["full", "metadata", "minimal", "raw"] as const)(
      "accepts format '%s'",
      (format) => {
        const result = getMessageSchema.parse({ messageId: "m1", format });
        expect(result.format).toBe(format);
      }
    );

    it("rejects invalid format", () => {
      expect(() =>
        getMessageSchema.parse({ messageId: "m1", format: "brief" })
      ).toThrow();
    });

    it("accepts optional preferHtml", () => {
      const result = getMessageSchema.parse({
        messageId: "m1",
        preferHtml: true,
      });
      expect(result.preferHtml).toBe(true);
    });
  });

  describe("getAttachmentSchema", () => {
    it("requires messageId and attachmentId", () => {
      expect(() => getAttachmentSchema.parse({})).toThrow();
      expect(() =>
        getAttachmentSchema.parse({ messageId: "m1" })
      ).toThrow();
    });

    it("accepts valid input", () => {
      const result = getAttachmentSchema.parse({
        messageId: "m1",
        attachmentId: "att1",
      });
      expect(result.messageId).toBe("m1");
      expect(result.attachmentId).toBe("att1");
    });
  });

  describe("sendMessageSchema", () => {
    it("requires to, subject, body", () => {
      expect(() => sendMessageSchema.parse({})).toThrow();
    });

    it("accepts valid input with optional replyTo", () => {
      const result = sendMessageSchema.parse({
        to: "a@b.com",
        subject: "hi",
        body: "hello",
        replyTo: "reply@b.com",
      });
      expect(result.replyTo).toBe("reply@b.com");
    });
  });

  describe("replyToMessageSchema", () => {
    it("requires messageId and body", () => {
      expect(() => replyToMessageSchema.parse({})).toThrow();
      expect(() =>
        replyToMessageSchema.parse({ messageId: "m1" })
      ).toThrow();
    });

    it("accepts valid input", () => {
      const result = replyToMessageSchema.parse({
        messageId: "m1",
        body: "Thanks!",
      });
      expect(result.messageId).toBe("m1");
      expect(result.body).toBe("Thanks!");
    });

    it("accepts optional replyAll", () => {
      const result = replyToMessageSchema.parse({
        messageId: "m1",
        body: "Thanks!",
        replyAll: true,
      });
      expect(result.replyAll).toBe(true);
    });
  });

  describe("forwardMessageSchema", () => {
    it("requires messageId and to", () => {
      expect(() => forwardMessageSchema.parse({})).toThrow();
      expect(() =>
        forwardMessageSchema.parse({ messageId: "m1" })
      ).toThrow();
    });

    it("accepts valid input", () => {
      const result = forwardMessageSchema.parse({
        messageId: "m1",
        to: "forward@b.com",
      });
      expect(result.to).toBe("forward@b.com");
    });

    it("accepts optional body and cc", () => {
      const result = forwardMessageSchema.parse({
        messageId: "m1",
        to: "forward@b.com",
        body: "FYI",
        cc: "cc@b.com",
      });
      expect(result.body).toBe("FYI");
      expect(result.cc).toBe("cc@b.com");
    });
  });

  describe("modifyMessageSchema", () => {
    it("requires messageId", () => {
      expect(() => modifyMessageSchema.parse({})).toThrow();
    });

    it("accepts valid input with labels", () => {
      const result = modifyMessageSchema.parse({
        messageId: "m1",
        addLabelIds: "STARRED",
        removeLabelIds: "UNREAD",
      });
      expect(result.addLabelIds).toBe("STARRED");
      expect(result.removeLabelIds).toBe("UNREAD");
    });
  });

  describe("trashMessageSchema", () => {
    it("requires messageId and operation", () => {
      expect(() => trashMessageSchema.parse({})).toThrow();
      expect(() =>
        trashMessageSchema.parse({ messageId: "m1" })
      ).toThrow();
    });

    it.each(["trash", "untrash"] as const)(
      "accepts operation '%s'",
      (operation) => {
        const result = trashMessageSchema.parse({
          messageId: "m1",
          operation,
        });
        expect(result.operation).toBe(operation);
      }
    );

    it("rejects invalid operation", () => {
      expect(() =>
        trashMessageSchema.parse({ messageId: "m1", operation: "delete" })
      ).toThrow();
    });
  });

  describe("batchModifyMessagesSchema", () => {
    it("requires operation and messageIds", () => {
      expect(() => batchModifyMessagesSchema.parse({})).toThrow();
      expect(() =>
        batchModifyMessagesSchema.parse({ operation: "modify" })
      ).toThrow();
    });

    it.each(["modify", "delete"] as const)(
      "accepts operation '%s'",
      (operation) => {
        const result = batchModifyMessagesSchema.parse({
          operation,
          messageIds: "m1,m2",
        });
        expect(result.operation).toBe(operation);
      }
    );

    it("rejects invalid operation", () => {
      expect(() =>
        batchModifyMessagesSchema.parse({
          operation: "archive",
          messageIds: "m1",
        })
      ).toThrow();
    });

    it("accepts optional label IDs for modify", () => {
      const result = batchModifyMessagesSchema.parse({
        operation: "modify",
        messageIds: "m1,m2",
        addLabelIds: "STARRED",
        removeLabelIds: "UNREAD",
      });
      expect(result.addLabelIds).toBe("STARRED");
    });
  });
});

// ── Thread schemas ──

describe("thread schemas", () => {
  describe("listThreadsSchema", () => {
    it("accepts empty object (all optional)", () => {
      const result = listThreadsSchema.parse({});
      expect(result).toBeDefined();
    });

    it("accepts full valid input", () => {
      const result = listThreadsSchema.parse({
        q: "is:unread",
        labelIds: "INBOX",
        maxResults: 20,
        pageToken: "tok",
        includeSpamTrash: false,
      });
      expect(result.q).toBe("is:unread");
    });
  });

  describe("getThreadSchema", () => {
    it("requires threadId", () => {
      expect(() => getThreadSchema.parse({})).toThrow();
    });

    it("accepts valid input", () => {
      const result = getThreadSchema.parse({ threadId: "t1" });
      expect(result.threadId).toBe("t1");
    });

    it.each(["full", "metadata", "minimal"] as const)(
      "accepts format '%s'",
      (format) => {
        const result = getThreadSchema.parse({ threadId: "t1", format });
        expect(result.format).toBe(format);
      }
    );

    it("rejects invalid format", () => {
      expect(() =>
        getThreadSchema.parse({ threadId: "t1", format: "raw" })
      ).toThrow();
    });
  });
});

// ── Multi-operation tool schemas ──

describe("multi-operation tool schemas", () => {
  describe("manageDraftsSchema", () => {
    it("requires operation", () => {
      expect(() => manageDraftsSchema.parse({})).toThrow();
    });

    it.each(["create", "update", "list", "get", "delete", "send"] as const)(
      "accepts operation '%s'",
      (operation) => {
        const result = manageDraftsSchema.parse({ operation });
        expect(result.operation).toBe(operation);
      }
    );

    it("rejects invalid operation", () => {
      expect(() =>
        manageDraftsSchema.parse({ operation: "archive" })
      ).toThrow();
    });

    it("accepts create fields", () => {
      const result = manageDraftsSchema.parse({
        operation: "create",
        to: "a@b.com",
        subject: "Draft",
        body: "Content",
        cc: "c@d.com",
        contentType: "text/html",
      });
      expect(result.to).toBe("a@b.com");
      expect(result.contentType).toBe("text/html");
    });

    it("accepts get/update/delete/send with draftId", () => {
      const result = manageDraftsSchema.parse({
        operation: "get",
        draftId: "d1",
      });
      expect(result.draftId).toBe("d1");
    });

    it("accepts list with pagination", () => {
      const result = manageDraftsSchema.parse({
        operation: "list",
        maxResults: 20,
        pageToken: "tok",
      });
      expect(result.maxResults).toBe(20);
    });
  });

  describe("manageLabelsSchema", () => {
    it("requires operation", () => {
      expect(() => manageLabelsSchema.parse({})).toThrow();
    });

    it.each(["list", "get", "create", "update", "delete"] as const)(
      "accepts operation '%s'",
      (operation) => {
        const result = manageLabelsSchema.parse({ operation });
        expect(result.operation).toBe(operation);
      }
    );

    it("rejects invalid operation", () => {
      expect(() =>
        manageLabelsSchema.parse({ operation: "rename" })
      ).toThrow();
    });

    it("accepts create fields with color", () => {
      const result = manageLabelsSchema.parse({
        operation: "create",
        name: "Important",
        color: "#000000,#16a765",
      });
      expect(result.name).toBe("Important");
      expect(result.color).toBe("#000000,#16a765");
    });

    it.each([
      "labelShow",
      "labelShowIfUnread",
      "labelHide",
    ] as const)("accepts visibility '%s'", (visibility) => {
      const result = manageLabelsSchema.parse({
        operation: "create",
        name: "Test",
        visibility,
      });
      expect(result.visibility).toBe(visibility);
    });

    it("rejects invalid visibility", () => {
      expect(() =>
        manageLabelsSchema.parse({
          operation: "create",
          name: "Test",
          visibility: "hidden",
        })
      ).toThrow();
    });

    it("accepts get/update/delete with labelId", () => {
      const result = manageLabelsSchema.parse({
        operation: "get",
        labelId: "Label_1",
      });
      expect(result.labelId).toBe("Label_1");
    });
  });

  describe("manageVacationSchema", () => {
    it("requires operation", () => {
      expect(() => manageVacationSchema.parse({})).toThrow();
    });

    it.each(["get", "update"] as const)(
      "accepts operation '%s'",
      (operation) => {
        const result = manageVacationSchema.parse({ operation });
        expect(result.operation).toBe(operation);
      }
    );

    it("rejects invalid operation", () => {
      expect(() =>
        manageVacationSchema.parse({ operation: "delete" })
      ).toThrow();
    });

    it("accepts update fields", () => {
      const result = manageVacationSchema.parse({
        operation: "update",
        enableAutoReply: true,
        responseSubject: "OOO",
        responseBody: "<p>I'm away</p>",
        startTime: "1704067200000",
        endTime: "1704153600000",
        restrictToContacts: true,
        restrictToDomain: false,
      });
      expect(result.enableAutoReply).toBe(true);
      expect(result.responseSubject).toBe("OOO");
    });
  });

  describe("manageFiltersSchema", () => {
    it("requires operation", () => {
      expect(() => manageFiltersSchema.parse({})).toThrow();
    });

    it.each(["list", "get", "create", "delete"] as const)(
      "accepts operation '%s'",
      (operation) => {
        const result = manageFiltersSchema.parse({ operation });
        expect(result.operation).toBe(operation);
      }
    );

    it("rejects invalid operation", () => {
      expect(() =>
        manageFiltersSchema.parse({ operation: "update" })
      ).toThrow();
    });

    it("accepts get/delete with filterId", () => {
      const result = manageFiltersSchema.parse({
        operation: "get",
        filterId: "f1",
      });
      expect(result.filterId).toBe("f1");
    });

    it("accepts create with criteria fields", () => {
      const result = manageFiltersSchema.parse({
        operation: "create",
        criteriaFrom: "alice@example.com",
        criteriaTo: "me@example.com",
        criteriaSubject: "report",
        criteriaQuery: "has:attachment",
        criteriaHasAttachment: true,
        criteriaSize: 5000000,
        criteriaSizeComparison: "larger",
      });
      expect(result.criteriaFrom).toBe("alice@example.com");
      expect(result.criteriaSize).toBe(5000000);
    });

    it.each(["larger", "smaller"] as const)(
      "accepts criteriaSizeComparison '%s'",
      (comp) => {
        const result = manageFiltersSchema.parse({
          operation: "create",
          criteriaSizeComparison: comp,
        });
        expect(result.criteriaSizeComparison).toBe(comp);
      }
    );

    it("rejects invalid criteriaSizeComparison", () => {
      expect(() =>
        manageFiltersSchema.parse({
          operation: "create",
          criteriaSizeComparison: "equal",
        })
      ).toThrow();
    });

    it("accepts create with action fields", () => {
      const result = manageFiltersSchema.parse({
        operation: "create",
        actionAddLabelIds: "STARRED,IMPORTANT",
        actionRemoveLabelIds: "INBOX",
        actionForward: "boss@example.com",
      });
      expect(result.actionAddLabelIds).toBe("STARRED,IMPORTANT");
      expect(result.actionForward).toBe("boss@example.com");
    });
  });
});

// ── Other schemas ──

describe("other schemas", () => {
  describe("getProfileSchema", () => {
    it("accepts empty object", () => {
      const result = getProfileSchema.parse({});
      expect(result).toEqual({});
    });
  });

  describe("listHistorySchema", () => {
    it("requires startHistoryId", () => {
      expect(() => listHistorySchema.parse({})).toThrow();
    });

    it("accepts valid input", () => {
      const result = listHistorySchema.parse({
        startHistoryId: "12345",
      });
      expect(result.startHistoryId).toBe("12345");
    });

    it("accepts optional fields", () => {
      const result = listHistorySchema.parse({
        startHistoryId: "12345",
        labelId: "INBOX",
        historyTypes: "messageAdded,labelAdded",
        maxResults: 100,
        pageToken: "tok",
      });
      expect(result.labelId).toBe("INBOX");
      expect(result.historyTypes).toBe("messageAdded,labelAdded");
    });
  });
});

// ── Attachment support ──

describe("attachment support", () => {
  const validAttachment = {
    filename: "report.pdf",
    mimeType: "application/pdf",
    base64Data: "dGVzdA==",
  };

  it("sendMessageSchema accepts attachments array", () => {
    const result = sendMessageSchema.parse({
      to: "a@b.com",
      subject: "hi",
      body: "hello",
      attachments: [validAttachment],
    });
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments![0].filename).toBe("report.pdf");
  });

  it("sendMessageSchema works without attachments (backward compat)", () => {
    const result = sendMessageSchema.parse({
      to: "a@b.com",
      subject: "hi",
      body: "hello",
    });
    expect(result.attachments).toBeUndefined();
  });

  it("forwardMessageSchema accepts includeOriginalAttachments", () => {
    const result = forwardMessageSchema.parse({
      messageId: "m1",
      to: "forward@b.com",
      includeOriginalAttachments: false,
    });
    expect(result.includeOriginalAttachments).toBe(false);
  });

  it("manageDraftsSchema accepts attachments for create", () => {
    const result = manageDraftsSchema.parse({
      operation: "create",
      to: "a@b.com",
      subject: "Draft",
      body: "Content",
      attachments: [validAttachment],
    });
    expect(result.attachments).toHaveLength(1);
  });

  it("rejects attachment with missing required fields", () => {
    expect(() =>
      sendMessageSchema.parse({
        to: "a@b.com",
        subject: "hi",
        body: "hello",
        attachments: [{ filename: "test.txt" }],
      })
    ).toThrow();

    expect(() =>
      sendMessageSchema.parse({
        to: "a@b.com",
        subject: "hi",
        body: "hello",
        attachments: [{ filename: "test.txt", mimeType: "text/plain" }],
      })
    ).toThrow();

    expect(() =>
      sendMessageSchema.parse({
        to: "a@b.com",
        subject: "hi",
        body: "hello",
        attachments: [{ mimeType: "text/plain", base64Data: "dGVzdA==" }],
      })
    ).toThrow();
  });
});

// ── Cross-cutting: schemas with all-optional fields accept {} ──

describe("schemas with all-optional/defaulted fields accept empty object", () => {
  it.each([
    ["listMessagesSchema", listMessagesSchema],
    ["listThreadsSchema", listThreadsSchema],
    ["getProfileSchema", getProfileSchema],
  ] as const)("%s accepts {}", (_name, schema) => {
    expect(() => schema.parse({})).not.toThrow();
  });
});

// ── Cross-cutting: schemas with required fields reject {} ──

describe("schemas with required fields reject empty object", () => {
  it.each([
    ["getMessageSchema", getMessageSchema],
    ["getAttachmentSchema", getAttachmentSchema],
    ["sendMessageSchema", sendMessageSchema],
    ["replyToMessageSchema", replyToMessageSchema],
    ["forwardMessageSchema", forwardMessageSchema],
    ["modifyMessageSchema", modifyMessageSchema],
    ["trashMessageSchema", trashMessageSchema],
    ["batchModifyMessagesSchema", batchModifyMessagesSchema],
    ["getThreadSchema", getThreadSchema],
    ["manageDraftsSchema", manageDraftsSchema],
    ["manageLabelsSchema", manageLabelsSchema],
    ["manageVacationSchema", manageVacationSchema],
    ["manageFiltersSchema", manageFiltersSchema],
    ["listHistorySchema", listHistorySchema],
  ] as const)("%s rejects {}", (_name, schema) => {
    expect(() => schema.parse({})).toThrow();
  });
});

// ── buildMimeMessage signature handling ──

describe("buildMimeMessage", () => {
  const base = { to: "a@b.com", subject: "hi", body: "Hello world" };

  function bodyFrom(mime: string): string {
    // Extract the body portion after the blank line separating headers
    const parts = mime.split("\r\n\r\n");
    return parts.slice(1).join("\r\n\r\n");
  }

  function headerValue(mime: string, name: string): string | undefined {
    for (const line of mime.split("\r\n")) {
      if (line.startsWith(`${name}: `)) return line.slice(name.length + 2);
    }
    return undefined;
  }

  describe("plaintextToHtml", () => {
    it("escapes HTML entities", () => {
      expect(plaintextToHtml("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
    });

    it("converts newlines to <br>", () => {
      expect(plaintextToHtml("line1\nline2\nline3")).toBe(
        "line1<br>line2<br>line3"
      );
    });

    it("handles empty string", () => {
      expect(plaintextToHtml("")).toBe("");
    });
  });

  describe("RFC 2047 encoding", () => {
    it("passes ASCII subjects through unchanged", () => {
      expect(encodeRfc2047("Hello world")).toBe("Hello world");
    });

    it("encodes non-ASCII subjects with RFC 2047 base64", () => {
      const subject = "Weekly Update — March 2026";
      const encoded = encodeRfc2047(subject);
      expect(encoded).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
      // Decode to verify round-trip
      const b64 = encoded.replace("=?UTF-8?B?", "").replace("?=", "");
      expect(Buffer.from(b64, "base64").toString("utf-8")).toBe(subject);
    });

    it("applies RFC 2047 to Subject header in MIME output", () => {
      const mime = buildMimeMessage({
        ...base,
        subject: "Test — Subject",
      });
      const subjectLine = mime.split("\r\n").find((l) => l.startsWith("Subject: "));
      expect(subjectLine).toMatch(/^Subject: =\?UTF-8\?B\?.+\?=$/);
    });

    it("leaves ASCII Subject header unencoded", () => {
      const mime = buildMimeMessage(base);
      const subjectLine = mime.split("\r\n").find((l) => l.startsWith("Subject: "));
      expect(subjectLine).toBe("Subject: hi");
    });

    it("encodes non-ASCII From display name in MIME output", () => {
      const mime = buildMimeMessage({
        ...base,
        from: `${encodeRfc2047("José García")} <jose@example.com>`,
      });
      const fromLine = mime.split("\r\n").find((l) => l.startsWith("From: "));
      expect(fromLine).toMatch(/^From: =\?UTF-8\?B\?.+\?= <jose@example\.com>$/);
    });

    it("leaves ASCII From display name unencoded", () => {
      const mime = buildMimeMessage({
        ...base,
        from: `${encodeRfc2047("John Smith")} <john@example.com>`,
      });
      const fromLine = mime.split("\r\n").find((l) => l.startsWith("From: "));
      expect(fromLine).toBe("From: John Smith <john@example.com>");
    });
  });

  describe("plain text without signature", () => {
    it("sends as text/plain", () => {
      const mime = buildMimeMessage(base);
      expect(headerValue(mime, "Content-Type")).toBe(
        "text/plain; charset=utf-8"
      );
      expect(bodyFrom(mime)).toBe("Hello world");
    });
  });

  describe("HTML body without signature", () => {
    it("sends as text/html", () => {
      const mime = buildMimeMessage({
        ...base,
        body: "<p>Hello</p>",
        contentType: "text/html",
      });
      expect(headerValue(mime, "Content-Type")).toBe(
        "text/html; charset=utf-8"
      );
      expect(bodyFrom(mime)).toBe("<p>Hello</p>");
    });
  });

  describe("plain text + HTML signature (the fix)", () => {
    const sig = '<b>John</b><img src="logo.png">';

    it("upgrades content type to text/html", () => {
      const mime = buildMimeMessage({ ...base, signatureHtml: sig });
      expect(headerValue(mime, "Content-Type")).toBe(
        "text/html; charset=utf-8"
      );
    });

    it("escapes the plain text body for HTML", () => {
      const mime = buildMimeMessage({
        ...base,
        body: "Use <b> & <i> tags",
        signatureHtml: sig,
      });
      const body = bodyFrom(mime);
      expect(body).toContain("Use &lt;b&gt; &amp; &lt;i&gt; tags");
    });

    it("converts newlines to <br>", () => {
      const mime = buildMimeMessage({
        ...base,
        body: "line1\nline2",
        signatureHtml: sig,
      });
      const body = bodyFrom(mime);
      expect(body).toContain("line1<br>line2");
    });

    it("preserves signature HTML (bold, images)", () => {
      const mime = buildMimeMessage({ ...base, signatureHtml: sig });
      const body = bodyFrom(mime);
      expect(body).toContain("<b>John</b>");
      expect(body).toContain('<img src="logo.png">');
    });

    it("wraps signature in gmail_signature div", () => {
      const mime = buildMimeMessage({ ...base, signatureHtml: sig });
      const body = bodyFrom(mime);
      expect(body).toContain('<div class="gmail_signature">');
    });
  });

  describe("HTML body + HTML signature", () => {
    it("appends signature without escaping body", () => {
      const mime = buildMimeMessage({
        ...base,
        body: "<p>Hello</p>",
        contentType: "text/html",
        signatureHtml: "<b>Sig</b>",
      });
      const body = bodyFrom(mime);
      expect(body).toContain("<p>Hello</p>");
      expect(body).toContain('<div class="gmail_signature"><b>Sig</b></div>');
    });
  });

  describe("no signature", () => {
    it("plain text stays plain text", () => {
      const mime = buildMimeMessage(base);
      expect(headerValue(mime, "Content-Type")).toBe(
        "text/plain; charset=utf-8"
      );
      expect(bodyFrom(mime)).not.toContain("gmail_signature");
    });

    it("null signature is ignored", () => {
      const mime = buildMimeMessage({ ...base, signatureHtml: null });
      expect(headerValue(mime, "Content-Type")).toBe(
        "text/plain; charset=utf-8"
      );
    });
  });

  describe("with attachments + signature upgrade", () => {
    it("uses text/html in multipart body part", () => {
      const sig = "<b>Sig</b>";
      const mime = buildMimeMessage({
        ...base,
        signatureHtml: sig,
        attachments: [
          {
            filename: "f.txt",
            mimeType: "text/plain",
            base64Data: "dGVzdA==",
          },
        ],
      });
      // The multipart body should contain a text/html part, not text/plain
      expect(mime).toContain("Content-Type: text/html; charset=utf-8");
      expect(mime).not.toContain("Content-Type: text/plain; charset=utf-8");
      expect(mime).toContain('<div class="gmail_signature"><b>Sig</b></div>');
    });
  });
});
