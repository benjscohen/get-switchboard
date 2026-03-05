import {
  contactId,
  companyId,
  conversationId,
  tagId,
  ticketId,
  segmentId,
  dataAttributeId,
  manageContactsSchema,
  manageCompaniesSchema,
  manageConversationsSchema,
  manageTagsSchema,
  applyTagsSchema,
  manageTicketsSchema,
  searchContactsSchema,
  manageSegmentsSchema,
  manageEventsSchema,
  manageNotesSchema,
  manageDataAttributesSchema,
  getCountsSchema,
  manageContactCompaniesSchema,
} from "./schemas";
import { INTERCOM_TOOLS } from "./tools";

// ── Shared fragments ──

describe("shared fragments", () => {
  it("contactId requires a string", () => {
    expect(() => contactId.parse(undefined)).toThrow();
    expect(contactId.parse("abc123")).toBe("abc123");
  });

  it("companyId requires a string", () => {
    expect(() => companyId.parse(undefined)).toThrow();
    expect(companyId.parse("comp1")).toBe("comp1");
  });

  it("conversationId requires a string", () => {
    expect(() => conversationId.parse(undefined)).toThrow();
    expect(conversationId.parse("conv1")).toBe("conv1");
  });

  it("tagId requires a string", () => {
    expect(() => tagId.parse(undefined)).toThrow();
    expect(tagId.parse("tag1")).toBe("tag1");
  });

  it("ticketId requires a string", () => {
    expect(() => ticketId.parse(undefined)).toThrow();
    expect(ticketId.parse("ticket1")).toBe("ticket1");
  });

  it("segmentId requires a string", () => {
    expect(() => segmentId.parse(undefined)).toThrow();
    expect(segmentId.parse("seg1")).toBe("seg1");
  });

  it("dataAttributeId requires a string", () => {
    expect(() => dataAttributeId.parse(undefined)).toThrow();
    expect(dataAttributeId.parse("da1")).toBe("da1");
  });
});

// ── Manage Contacts ──

describe("manageContactsSchema", () => {
  it("requires operation", () => {
    expect(() => manageContactsSchema.parse({})).toThrow();
  });

  it.each([
    "get",
    "create",
    "update",
    "delete",
    "list",
    "archive",
    "unarchive",
  ] as const)("accepts operation '%s'", (operation) => {
    const result = manageContactsSchema.parse({ operation });
    expect(result.operation).toBe(operation);
  });

  it("rejects invalid operation", () => {
    expect(() =>
      manageContactsSchema.parse({ operation: "merge" })
    ).toThrow();
  });

  it("accepts create fields", () => {
    const result = manageContactsSchema.parse({
      operation: "create",
      role: "user",
      email: "test@example.com",
      name: "Test User",
      phone: "+1234567890",
    });
    expect(result.role).toBe("user");
    expect(result.email).toBe("test@example.com");
  });

  it.each(["lead", "user"] as const)("accepts role '%s'", (role) => {
    const result = manageContactsSchema.parse({
      operation: "create",
      role,
    });
    expect(result.role).toBe(role);
  });

  it("rejects invalid role", () => {
    expect(() =>
      manageContactsSchema.parse({ operation: "create", role: "admin" })
    ).toThrow();
  });
});

// ── Manage Companies ──

describe("manageCompaniesSchema", () => {
  it("requires operation", () => {
    expect(() => manageCompaniesSchema.parse({})).toThrow();
  });

  it.each([
    "get",
    "create",
    "update",
    "list",
    "search",
    "list_contacts",
  ] as const)("accepts operation '%s'", (operation) => {
    const result = manageCompaniesSchema.parse({ operation });
    expect(result.operation).toBe(operation);
  });

  it("rejects invalid operation", () => {
    expect(() =>
      manageCompaniesSchema.parse({ operation: "delete" })
    ).toThrow();
  });

  it("accepts create fields", () => {
    const result = manageCompaniesSchema.parse({
      operation: "create",
      name: "Acme Inc",
      plan: "pro",
      size: 50,
      website: "https://acme.com",
      industry: "Technology",
    });
    expect(result.name).toBe("Acme Inc");
    expect(result.size).toBe(50);
  });
});

// ── Manage Conversations ──

describe("manageConversationsSchema", () => {
  it("requires operation", () => {
    expect(() => manageConversationsSchema.parse({})).toThrow();
  });

  it.each([
    "get",
    "list",
    "search",
    "create",
    "reply",
    "close",
    "open",
    "assign",
    "snooze",
    "unsnooze",
  ] as const)("accepts operation '%s'", (operation) => {
    const result = manageConversationsSchema.parse({ operation });
    expect(result.operation).toBe(operation);
  });

  it("rejects invalid operation", () => {
    expect(() =>
      manageConversationsSchema.parse({ operation: "delete" })
    ).toThrow();
  });

  it("accepts reply fields", () => {
    const result = manageConversationsSchema.parse({
      operation: "reply",
      conversation_id: "conv1",
      message_type: "comment",
      admin_id: "admin1",
      body: "Hello!",
    });
    expect(result.message_type).toBe("comment");
  });

  it.each(["comment", "note"] as const)(
    "accepts message_type '%s'",
    (message_type) => {
      const result = manageConversationsSchema.parse({
        operation: "reply",
        message_type,
      });
      expect(result.message_type).toBe(message_type);
    }
  );

  it("rejects invalid message_type", () => {
    expect(() =>
      manageConversationsSchema.parse({
        operation: "reply",
        message_type: "email",
      })
    ).toThrow();
  });

  it("accepts snooze fields", () => {
    const result = manageConversationsSchema.parse({
      operation: "snooze",
      conversation_id: "conv1",
      admin_id: "admin1",
      snoozed_until: 1700000000,
    });
    expect(result.snoozed_until).toBe(1700000000);
  });
});

// ── Manage Tags ──

describe("manageTagsSchema", () => {
  it("requires operation", () => {
    expect(() => manageTagsSchema.parse({})).toThrow();
  });

  it.each(["list", "get", "create", "update", "delete"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageTagsSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() => manageTagsSchema.parse({ operation: "archive" })).toThrow();
  });

  it("accepts create fields", () => {
    const result = manageTagsSchema.parse({
      operation: "create",
      name: "VIP",
    });
    expect(result.name).toBe("VIP");
  });
});

// ── Apply Tags ──

describe("applyTagsSchema", () => {
  it("requires operation and tag_id", () => {
    expect(() => applyTagsSchema.parse({})).toThrow();
    expect(() =>
      applyTagsSchema.parse({ operation: "tag_contact" })
    ).toThrow();
  });

  it.each([
    "tag_contact",
    "untag_contact",
    "tag_conversation",
    "untag_conversation",
    "tag_company",
    "untag_company",
  ] as const)("accepts operation '%s'", (operation) => {
    const result = applyTagsSchema.parse({ operation, tag_id: "t1" });
    expect(result.operation).toBe(operation);
  });

  it("rejects invalid operation", () => {
    expect(() =>
      applyTagsSchema.parse({ operation: "tag_ticket", tag_id: "t1" })
    ).toThrow();
  });

  it("accepts contact tagging fields", () => {
    const result = applyTagsSchema.parse({
      operation: "tag_contact",
      tag_id: "t1",
      contact_id: "c1",
    });
    expect(result.contact_id).toBe("c1");
  });
});

// ── Manage Tickets ──

describe("manageTicketsSchema", () => {
  it("requires operation", () => {
    expect(() => manageTicketsSchema.parse({})).toThrow();
  });

  it.each(["get", "create", "update", "search", "reply"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageTicketsSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      manageTicketsSchema.parse({ operation: "delete" })
    ).toThrow();
  });

  it("accepts create fields", () => {
    const result = manageTicketsSchema.parse({
      operation: "create",
      ticket_type_id: "tt1",
      title: "Bug Report",
      description: "Something broken",
      contact_id: "c1",
    });
    expect(result.title).toBe("Bug Report");
  });

  it.each(["comment", "note"] as const)(
    "accepts message_type '%s'",
    (message_type) => {
      const result = manageTicketsSchema.parse({
        operation: "reply",
        message_type,
      });
      expect(result.message_type).toBe(message_type);
    }
  );
});

// ── Search Contacts ──

describe("searchContactsSchema", () => {
  it("accepts friendly fields", () => {
    const result = searchContactsSchema.parse({
      email: "test@test.com",
      name: "Joe",
      email_domain: "example.com",
      phone: "+1234567890",
      role: "user",
      contact_ids: "id1,id2",
      custom_attributes: '{"plan":"pro"}',
    });
    expect(result.email).toBe("test@test.com");
    expect(result.name).toBe("Joe");
    expect(result.email_domain).toBe("example.com");
    expect(result.phone).toBe("+1234567890");
    expect(result.role).toBe("user");
    expect(result.contact_ids).toBe("id1,id2");
    expect(result.custom_attributes).toBe('{"plan":"pro"}');
  });

  it("accepts raw query passthrough", () => {
    const result = searchContactsSchema.parse({
      query: '{"field":"email","operator":"=","value":"test@test.com"}',
    });
    expect(result.query).toContain("email");
  });

  it("accepts empty object (validation happens in execute)", () => {
    const result = searchContactsSchema.parse({});
    expect(result).toBeDefined();
  });

  it("accepts pagination with friendly fields", () => {
    const result = searchContactsSchema.parse({
      email: "test@test.com",
      per_page: 25,
      starting_after: "abc",
    });
    expect(result.per_page).toBe(25);
    expect(result.starting_after).toBe("abc");
  });

  it("rejects invalid role", () => {
    expect(() =>
      searchContactsSchema.parse({ role: "invalid" })
    ).toThrow();
  });
});

// ── Manage Segments ──

describe("manageSegmentsSchema", () => {
  it("requires operation", () => {
    expect(() => manageSegmentsSchema.parse({})).toThrow();
  });

  it.each(["list", "get"] as const)("accepts operation '%s'", (operation) => {
    const result = manageSegmentsSchema.parse({ operation });
    expect(result.operation).toBe(operation);
  });

  it("rejects invalid operation", () => {
    expect(() =>
      manageSegmentsSchema.parse({ operation: "create" })
    ).toThrow();
  });

  it("accepts include_count", () => {
    const result = manageSegmentsSchema.parse({
      operation: "list",
      include_count: true,
    });
    expect(result.include_count).toBe(true);
  });
});

// ── Manage Events ──

describe("manageEventsSchema", () => {
  it("requires operation", () => {
    expect(() => manageEventsSchema.parse({})).toThrow();
  });

  it.each(["track", "list"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageEventsSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      manageEventsSchema.parse({ operation: "delete" })
    ).toThrow();
  });

  it("accepts track fields", () => {
    const result = manageEventsSchema.parse({
      operation: "track",
      event_name: "page_view",
      user_id: "u1",
      metadata: '{"url":"/home"}',
    });
    expect(result.event_name).toBe("page_view");
  });
});

// ── Manage Notes ──

describe("manageNotesSchema", () => {
  it("requires operation and contact_id", () => {
    expect(() => manageNotesSchema.parse({})).toThrow();
    expect(() => manageNotesSchema.parse({ operation: "list" })).toThrow();
  });

  it.each(["list", "create"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageNotesSchema.parse({
        operation,
        contact_id: "c1",
      });
      expect(result.operation).toBe(operation);
    }
  );

  it("accepts create fields", () => {
    const result = manageNotesSchema.parse({
      operation: "create",
      contact_id: "c1",
      body: "<p>Important note</p>",
      admin_id: "admin1",
    });
    expect(result.body).toBe("<p>Important note</p>");
  });
});

// ── Manage Data Attributes ──

describe("manageDataAttributesSchema", () => {
  it("requires operation", () => {
    expect(() => manageDataAttributesSchema.parse({})).toThrow();
  });

  it.each(["list", "create", "update"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageDataAttributesSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      manageDataAttributesSchema.parse({ operation: "delete" })
    ).toThrow();
  });

  it.each(["contact", "company", "conversation"] as const)(
    "accepts model '%s'",
    (model) => {
      const result = manageDataAttributesSchema.parse({
        operation: "list",
        model,
      });
      expect(result.model).toBe(model);
    }
  );

  it("rejects invalid model", () => {
    expect(() =>
      manageDataAttributesSchema.parse({ operation: "list", model: "ticket" })
    ).toThrow();
  });

  it.each(["string", "integer", "float", "boolean", "date"] as const)(
    "accepts data_type '%s'",
    (data_type) => {
      const result = manageDataAttributesSchema.parse({
        operation: "create",
        data_type,
      });
      expect(result.data_type).toBe(data_type);
    }
  );

  it("rejects invalid data_type", () => {
    expect(() =>
      manageDataAttributesSchema.parse({
        operation: "create",
        data_type: "array",
      })
    ).toThrow();
  });

  it("accepts create fields", () => {
    const result = manageDataAttributesSchema.parse({
      operation: "create",
      name: "plan_tier",
      model: "contact",
      data_type: "string",
      label: "Plan Tier",
      description: "The customer plan tier",
    });
    expect(result.name).toBe("plan_tier");
    expect(result.label).toBe("Plan Tier");
  });

  it("accepts update fields", () => {
    const result = manageDataAttributesSchema.parse({
      operation: "update",
      data_attribute_id: "da1",
      label: "Updated Label",
      archived: true,
    });
    expect(result.archived).toBe(true);
  });
});

// ── Get Counts ──

describe("getCountsSchema", () => {
  it("accepts empty object", () => {
    const result = getCountsSchema.parse({});
    expect(result.type).toBeUndefined();
  });

  it.each([
    "user",
    "company",
    "conversation",
    "tag",
    "segment",
    "lead",
  ] as const)("accepts type '%s'", (type) => {
    const result = getCountsSchema.parse({ type });
    expect(result.type).toBe(type);
  });

  it("rejects invalid type", () => {
    expect(() => getCountsSchema.parse({ type: "ticket" })).toThrow();
  });

  it("accepts count_type", () => {
    const result = getCountsSchema.parse({
      type: "user",
      count_type: "tag",
    });
    expect(result.count_type).toBe("tag");
  });
});

// ── Manage Contact Companies ──

describe("manageContactCompaniesSchema", () => {
  it("requires operation and contact_id", () => {
    expect(() => manageContactCompaniesSchema.parse({})).toThrow();
    expect(() =>
      manageContactCompaniesSchema.parse({ operation: "list" })
    ).toThrow();
  });

  it.each(["attach", "detach", "list"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageContactCompaniesSchema.parse({
        operation,
        contact_id: "c1",
      });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      manageContactCompaniesSchema.parse({
        operation: "create",
        contact_id: "c1",
      })
    ).toThrow();
  });

  it("accepts attach fields", () => {
    const result = manageContactCompaniesSchema.parse({
      operation: "attach",
      contact_id: "c1",
      company_id: "comp1",
    });
    expect(result.company_id).toBe("comp1");
  });
});

// ── Tool count ──

describe("tool count", () => {
  it("exports exactly 13 tools", () => {
    expect(INTERCOM_TOOLS).toHaveLength(13);
  });
});

// ── Cross-cutting: schemas with required fields reject {} ──

describe("all schemas with required fields reject empty object", () => {
  it.each([
    ["manageContactsSchema", manageContactsSchema],
    ["manageCompaniesSchema", manageCompaniesSchema],
    ["manageConversationsSchema", manageConversationsSchema],
    ["manageTagsSchema", manageTagsSchema],
    ["applyTagsSchema", applyTagsSchema],
    ["manageTicketsSchema", manageTicketsSchema],
    ["manageSegmentsSchema", manageSegmentsSchema],
    ["manageEventsSchema", manageEventsSchema],
    ["manageNotesSchema", manageNotesSchema],
    ["manageDataAttributesSchema", manageDataAttributesSchema],
    ["manageContactCompaniesSchema", manageContactCompaniesSchema],
  ] as const)("%s rejects {}", (_name, schema) => {
    expect(() => schema.parse({})).toThrow();
  });
});
