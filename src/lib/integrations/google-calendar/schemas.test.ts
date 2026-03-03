import { z } from "zod";
import {
  calendarId,
  eventId,
  sendUpdates,
  maxResults,
  listEventsSchema,
  getEventSchema,
  createEventSchema,
  updateEventSchema,
  patchEventSchema,
  deleteEventSchema,
  moveEventSchema,
  quickAddSchema,
  importEventSchema,
  listInstancesSchema,
  rsvpSchema,
  searchEventsSchema,
  watchEventsSchema,
  batchEventsSchema,
  listCalendarsSchema,
  getCalendarSchema,
  createCalendarSchema,
  updateCalendarSchema,
  deleteCalendarSchema,
  clearCalendarSchema,
  getCalendarEntrySchema,
  updateCalendarEntrySchema,
  addCalendarSchema,
  removeCalendarSchema,
  listSharingRulesSchema,
  shareCalendarSchema,
  updateSharingSchema,
  unshareCalendarSchema,
  findFreeBusySchema,
  getSettingsSchema,
  getSettingSchema,
  getColorsSchema,
  stopWatchingSchema,
} from "./schemas";

// ── Shared fragments ──

describe("shared fragments", () => {
  it("calendarId defaults to 'primary'", () => {
    expect(calendarId.parse(undefined)).toBe("primary");
  });

  it("calendarId accepts a custom string", () => {
    expect(calendarId.parse("work@group.calendar.google.com")).toBe(
      "work@group.calendar.google.com"
    );
  });

  it("eventId requires a string", () => {
    expect(() => eventId.parse(undefined)).toThrow();
    expect(eventId.parse("abc123")).toBe("abc123");
  });

  it("sendUpdates defaults to 'none'", () => {
    expect(sendUpdates.parse(undefined)).toBe("none");
  });

  it("sendUpdates rejects invalid enum values", () => {
    expect(() => sendUpdates.parse("everyone")).toThrow();
  });

  it("maxResults defaults to 10", () => {
    expect(maxResults.parse(undefined)).toBe(10);
  });

  it("maxResults rejects values below 1", () => {
    expect(() => maxResults.parse(0)).toThrow();
    expect(() => maxResults.parse(-5)).toThrow();
  });

  it("maxResults rejects values above 2500", () => {
    expect(() => maxResults.parse(2501)).toThrow();
  });

  it("maxResults rejects non-integer values", () => {
    expect(() => maxResults.parse(1.5)).toThrow();
  });

  it("maxResults accepts boundary values", () => {
    expect(maxResults.parse(1)).toBe(1);
    expect(maxResults.parse(2500)).toBe(2500);
  });
});

// ── Event schemas ──

describe("event schemas", () => {
  describe("listEventsSchema", () => {
    it("accepts empty object with defaults", () => {
      const result = listEventsSchema.parse({});
      expect(result.calendarId).toBe("primary");
      expect(result.maxResults).toBe(10);
      expect(result.singleEvents).toBe(true);
      expect(result.orderBy).toBe("startTime");
    });

    it("accepts full valid input", () => {
      const result = listEventsSchema.parse({
        calendarId: "cal1",
        timeMin: "2024-01-01T00:00:00Z",
        timeMax: "2024-12-31T23:59:59Z",
        maxResults: 50,
        q: "meeting",
        singleEvents: false,
        orderBy: "updated",
      });
      expect(result.calendarId).toBe("cal1");
      expect(result.orderBy).toBe("updated");
    });

    it("rejects invalid orderBy value", () => {
      expect(() =>
        listEventsSchema.parse({ orderBy: "created" })
      ).toThrow();
    });
  });

  describe("getEventSchema", () => {
    it("accepts valid input", () => {
      const result = getEventSchema.parse({ eventId: "e1" });
      expect(result.calendarId).toBe("primary");
      expect(result.eventId).toBe("e1");
    });

    it("rejects missing eventId", () => {
      expect(() => getEventSchema.parse({})).toThrow();
    });
  });

  describe("createEventSchema", () => {
    it("accepts minimal input with defaults", () => {
      const result = createEventSchema.parse({});
      expect(result.calendarId).toBe("primary");
      expect(result.sendUpdates).toBe("none");
    });

    it("accepts full event body", () => {
      const result = createEventSchema.parse({
        summary: "Team standup",
        start: { dateTime: "2024-06-01T09:00:00Z" },
        end: { dateTime: "2024-06-01T09:30:00Z" },
        attendees: [{ email: "bob@example.com" }],
        visibility: "private",
        conferenceDataVersion: 1,
      });
      expect(result.summary).toBe("Team standup");
    });

    it("rejects invalid visibility enum", () => {
      expect(() =>
        createEventSchema.parse({ visibility: "secret" })
      ).toThrow();
    });
  });

  describe("updateEventSchema", () => {
    it("requires eventId", () => {
      expect(() => updateEventSchema.parse({})).toThrow();
    });

    it("accepts valid input", () => {
      const result = updateEventSchema.parse({
        eventId: "e1",
        summary: "Updated title",
      });
      expect(result.eventId).toBe("e1");
      expect(result.sendUpdates).toBe("none");
    });
  });

  describe("patchEventSchema", () => {
    it("requires eventId", () => {
      expect(() => patchEventSchema.parse({})).toThrow();
    });

    it("accepts valid input", () => {
      const result = patchEventSchema.parse({
        eventId: "e1",
        summary: "Patched",
      });
      expect(result.summary).toBe("Patched");
    });
  });

  describe("deleteEventSchema", () => {
    it("requires eventId", () => {
      expect(() => deleteEventSchema.parse({})).toThrow();
    });

    it("accepts valid input with defaults", () => {
      const result = deleteEventSchema.parse({ eventId: "e1" });
      expect(result.calendarId).toBe("primary");
      expect(result.sendUpdates).toBe("none");
    });
  });

  describe("moveEventSchema", () => {
    it("requires eventId and destination", () => {
      expect(() => moveEventSchema.parse({})).toThrow();
      expect(() => moveEventSchema.parse({ eventId: "e1" })).toThrow();
    });

    it("accepts valid input", () => {
      const result = moveEventSchema.parse({
        eventId: "e1",
        destination: "other-cal",
      });
      expect(result.destination).toBe("other-cal");
    });
  });

  describe("quickAddSchema", () => {
    it("requires text", () => {
      expect(() => quickAddSchema.parse({})).toThrow();
    });

    it("accepts valid input", () => {
      const result = quickAddSchema.parse({
        text: "Lunch with Alice tomorrow at noon",
      });
      expect(result.text).toBe("Lunch with Alice tomorrow at noon");
      expect(result.calendarId).toBe("primary");
    });
  });

  describe("importEventSchema", () => {
    it("requires iCalUID", () => {
      expect(() => importEventSchema.parse({})).toThrow();
    });

    it("accepts valid input", () => {
      const result = importEventSchema.parse({
        iCalUID: "uid@example.com",
        summary: "Imported event",
      });
      expect(result.iCalUID).toBe("uid@example.com");
    });
  });

  describe("listInstancesSchema", () => {
    it("requires eventId", () => {
      expect(() => listInstancesSchema.parse({})).toThrow();
    });

    it("accepts valid input with defaults", () => {
      const result = listInstancesSchema.parse({ eventId: "e1" });
      expect(result.maxResults).toBe(10);
      expect(result.calendarId).toBe("primary");
    });
  });

  describe("rsvpSchema", () => {
    it("requires eventId and responseStatus", () => {
      expect(() => rsvpSchema.parse({})).toThrow();
      expect(() => rsvpSchema.parse({ eventId: "e1" })).toThrow();
    });

    it("accepts valid enum values", () => {
      const result = rsvpSchema.parse({
        eventId: "e1",
        responseStatus: "accepted",
      });
      expect(result.responseStatus).toBe("accepted");
    });

    it("rejects invalid responseStatus", () => {
      expect(() =>
        rsvpSchema.parse({ eventId: "e1", responseStatus: "maybe" })
      ).toThrow();
    });

    it.each(["accepted", "declined", "tentative"] as const)(
      "accepts responseStatus '%s'",
      (status) => {
        expect(
          rsvpSchema.parse({ eventId: "e1", responseStatus: status })
            .responseStatus
        ).toBe(status);
      }
    );
  });

  describe("searchEventsSchema", () => {
    it("requires q", () => {
      expect(() => searchEventsSchema.parse({})).toThrow();
    });

    it("accepts valid input", () => {
      const result = searchEventsSchema.parse({ q: "standup" });
      expect(result.q).toBe("standup");
      expect(result.maxResults).toBe(10);
    });
  });

  describe("watchEventsSchema", () => {
    it("requires channelId and address", () => {
      expect(() => watchEventsSchema.parse({})).toThrow();
      expect(() =>
        watchEventsSchema.parse({ channelId: "ch1" })
      ).toThrow();
    });

    it("accepts valid input", () => {
      const result = watchEventsSchema.parse({
        channelId: "ch1",
        address: "https://example.com/webhook",
        ttl: 3600,
      });
      expect(result.address).toBe("https://example.com/webhook");
    });
  });

  describe("batchEventsSchema", () => {
    it("requires operations array", () => {
      expect(() => batchEventsSchema.parse({})).toThrow();
    });

    it("accepts valid operations", () => {
      const result = batchEventsSchema.parse({
        operations: [
          { method: "create", body: { summary: "New" } },
          { method: "update", eventId: "e1", body: { summary: "Updated" } },
          { method: "delete", eventId: "e2" },
        ],
      });
      expect(result.operations).toHaveLength(3);
    });

    it("rejects invalid method in operations", () => {
      expect(() =>
        batchEventsSchema.parse({
          operations: [{ method: "patch" }],
        })
      ).toThrow();
    });
  });
});

// ── Calendar schemas ──

describe("calendar schemas", () => {
  describe("listCalendarsSchema", () => {
    it("accepts empty object", () => {
      const result = listCalendarsSchema.parse({});
      expect(result).toBeDefined();
    });
  });

  describe("getCalendarSchema", () => {
    it("accepts empty object with default calendarId", () => {
      const result = getCalendarSchema.parse({});
      expect(result.calendarId).toBe("primary");
    });
  });

  describe("createCalendarSchema", () => {
    it("requires summary", () => {
      expect(() => createCalendarSchema.parse({})).toThrow();
    });

    it("accepts valid input", () => {
      const result = createCalendarSchema.parse({
        summary: "Work",
        timeZone: "America/New_York",
      });
      expect(result.summary).toBe("Work");
    });
  });

  describe("updateCalendarSchema", () => {
    it("accepts empty object with default calendarId", () => {
      const result = updateCalendarSchema.parse({});
      expect(result.calendarId).toBe("primary");
    });

    it("accepts optional fields", () => {
      const result = updateCalendarSchema.parse({
        calendarId: "cal1",
        summary: "Renamed",
        description: "New desc",
      });
      expect(result.summary).toBe("Renamed");
    });
  });

  describe("deleteCalendarSchema", () => {
    it("accepts empty object with default calendarId", () => {
      const result = deleteCalendarSchema.parse({});
      expect(result.calendarId).toBe("primary");
    });
  });

  describe("clearCalendarSchema", () => {
    it("accepts empty object with default calendarId", () => {
      const result = clearCalendarSchema.parse({});
      expect(result.calendarId).toBe("primary");
    });
  });
});

// ── Calendar List schemas ──

describe("calendar list schemas", () => {
  describe("getCalendarEntrySchema", () => {
    it("defaults calendarId to primary", () => {
      expect(getCalendarEntrySchema.parse({}).calendarId).toBe("primary");
    });
  });

  describe("updateCalendarEntrySchema", () => {
    it("accepts empty object with default calendarId", () => {
      const result = updateCalendarEntrySchema.parse({});
      expect(result.calendarId).toBe("primary");
    });

    it("accepts all optional fields", () => {
      const result = updateCalendarEntrySchema.parse({
        defaultReminders: [{ method: "popup", minutes: 10 }],
        backgroundColor: "#ff0000",
        hidden: false,
        selected: true,
        summaryOverride: "My Cal",
        notificationSettings: {
          notifications: [{ method: "email", type: "eventCreation" }],
        },
      });
      expect(result.defaultReminders).toHaveLength(1);
    });
  });

  describe("addCalendarSchema", () => {
    it("requires id", () => {
      expect(() => addCalendarSchema.parse({})).toThrow();
    });

    it("accepts valid input", () => {
      const result = addCalendarSchema.parse({
        id: "cal@group.calendar.google.com",
        selected: true,
      });
      expect(result.id).toBe("cal@group.calendar.google.com");
    });
  });

  describe("removeCalendarSchema", () => {
    it("defaults calendarId to primary", () => {
      expect(removeCalendarSchema.parse({}).calendarId).toBe("primary");
    });
  });
});

// ── Sharing (ACL) schemas ──

describe("sharing schemas", () => {
  describe("listSharingRulesSchema", () => {
    it("accepts empty object with default calendarId", () => {
      const result = listSharingRulesSchema.parse({});
      expect(result.calendarId).toBe("primary");
    });
  });

  describe("shareCalendarSchema", () => {
    it("requires role and scope", () => {
      expect(() => shareCalendarSchema.parse({})).toThrow();
    });

    it("accepts valid input with sendNotifications default", () => {
      const result = shareCalendarSchema.parse({
        role: "reader",
        scope: { type: "user", value: "alice@example.com" },
      });
      expect(result.sendNotifications).toBe(true);
      expect(result.calendarId).toBe("primary");
    });

    it("rejects invalid role", () => {
      expect(() =>
        shareCalendarSchema.parse({
          role: "admin",
          scope: { type: "user" },
        })
      ).toThrow();
    });

    it.each(["none", "freeBusyReader", "reader", "writer", "owner"] as const)(
      "accepts role '%s'",
      (role) => {
        const result = shareCalendarSchema.parse({
          role,
          scope: { type: "domain", value: "example.com" },
        });
        expect(result.role).toBe(role);
      }
    );
  });

  describe("updateSharingSchema", () => {
    it("requires ruleId and role", () => {
      expect(() => updateSharingSchema.parse({})).toThrow();
      expect(() =>
        updateSharingSchema.parse({ ruleId: "r1" })
      ).toThrow();
    });

    it("accepts valid input with sendNotifications default", () => {
      const result = updateSharingSchema.parse({
        ruleId: "r1",
        role: "writer",
      });
      expect(result.sendNotifications).toBe(true);
    });
  });

  describe("unshareCalendarSchema", () => {
    it("requires ruleId", () => {
      expect(() => unshareCalendarSchema.parse({})).toThrow();
    });

    it("accepts valid input", () => {
      const result = unshareCalendarSchema.parse({ ruleId: "r1" });
      expect(result.calendarId).toBe("primary");
    });
  });
});

// ── Other schemas ──

describe("other schemas", () => {
  describe("findFreeBusySchema", () => {
    it("requires timeMin, timeMax, and items", () => {
      expect(() => findFreeBusySchema.parse({})).toThrow();
      expect(() =>
        findFreeBusySchema.parse({ timeMin: "2024-01-01T00:00:00Z" })
      ).toThrow();
    });

    it("accepts valid input", () => {
      const result = findFreeBusySchema.parse({
        timeMin: "2024-01-01T00:00:00Z",
        timeMax: "2024-01-02T00:00:00Z",
        items: [{ id: "primary" }],
      });
      expect(result.items).toHaveLength(1);
    });
  });

  describe("getSettingsSchema", () => {
    it("accepts empty object", () => {
      const result = getSettingsSchema.parse({});
      expect(result).toBeDefined();
    });
  });

  describe("getSettingSchema", () => {
    it("requires setting", () => {
      expect(() => getSettingSchema.parse({})).toThrow();
    });

    it("accepts valid input", () => {
      const result = getSettingSchema.parse({ setting: "timezone" });
      expect(result.setting).toBe("timezone");
    });
  });

  describe("getColorsSchema", () => {
    it("accepts empty object", () => {
      const result = getColorsSchema.parse({});
      expect(result).toEqual({});
    });
  });

  describe("stopWatchingSchema", () => {
    it("requires channelId and resourceId", () => {
      expect(() => stopWatchingSchema.parse({})).toThrow();
      expect(() =>
        stopWatchingSchema.parse({ channelId: "ch1" })
      ).toThrow();
    });

    it("accepts valid input", () => {
      const result = stopWatchingSchema.parse({
        channelId: "ch1",
        resourceId: "res1",
      });
      expect(result.channelId).toBe("ch1");
      expect(result.resourceId).toBe("res1");
    });
  });
});

// ── Cross-cutting: schemas with all-optional fields accept {} ──

describe("schemas with all-optional/defaulted fields accept empty object", () => {
  it.each([
    ["listEventsSchema", listEventsSchema],
    ["createEventSchema", createEventSchema],
    ["getCalendarSchema", getCalendarSchema],
    ["deleteCalendarSchema", deleteCalendarSchema],
    ["clearCalendarSchema", clearCalendarSchema],
    ["getCalendarEntrySchema", getCalendarEntrySchema],
    ["updateCalendarEntrySchema", updateCalendarEntrySchema],
    ["removeCalendarSchema", removeCalendarSchema],
    ["listCalendarsSchema", listCalendarsSchema],
    ["listSharingRulesSchema", listSharingRulesSchema],
    ["getSettingsSchema", getSettingsSchema],
    ["getColorsSchema", getColorsSchema],
    ["updateCalendarSchema", updateCalendarSchema],
  ] as const)("%s accepts {}", (_name, schema) => {
    expect(() => schema.parse({})).not.toThrow();
  });
});

// ── Cross-cutting: schemas with required fields reject {} ──

describe("schemas with required fields reject empty object", () => {
  it.each([
    ["getEventSchema", getEventSchema],
    ["updateEventSchema", updateEventSchema],
    ["patchEventSchema", patchEventSchema],
    ["deleteEventSchema", deleteEventSchema],
    ["moveEventSchema", moveEventSchema],
    ["quickAddSchema", quickAddSchema],
    ["importEventSchema", importEventSchema],
    ["listInstancesSchema", listInstancesSchema],
    ["rsvpSchema", rsvpSchema],
    ["searchEventsSchema", searchEventsSchema],
    ["watchEventsSchema", watchEventsSchema],
    ["batchEventsSchema", batchEventsSchema],
    ["createCalendarSchema", createCalendarSchema],
    ["addCalendarSchema", addCalendarSchema],
    ["shareCalendarSchema", shareCalendarSchema],
    ["updateSharingSchema", updateSharingSchema],
    ["unshareCalendarSchema", unshareCalendarSchema],
    ["findFreeBusySchema", findFreeBusySchema],
    ["getSettingSchema", getSettingSchema],
    ["stopWatchingSchema", stopWatchingSchema],
  ] as const)("%s rejects {}", (_name, schema) => {
    expect(() => schema.parse({})).toThrow();
  });
});
