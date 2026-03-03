import { z } from "zod";

// ── Shared fragments ──

export const calendarId = z
  .string()
  .default("primary")
  .describe('Calendar ID. Use "primary" for the user\'s main calendar.');

export const eventId = z.string().describe("Event ID");

export const sendUpdates = z
  .enum(["all", "externalOnly", "none"])
  .default("none")
  .describe("Who to send notifications to");

export const timeRange = {
  timeMin: z
    .string()
    .optional()
    .describe("Start time (RFC3339, e.g. 2024-01-01T00:00:00Z)"),
  timeMax: z
    .string()
    .optional()
    .describe("End time (RFC3339, e.g. 2024-12-31T23:59:59Z)"),
};

export const pageToken = z
  .string()
  .optional()
  .describe("Token for paginating results");

export const maxResults = z
  .number()
  .int()
  .min(1)
  .max(2500)
  .default(10)
  .describe("Maximum number of results");

// ── Event body shared shape ──

const attendee = z.object({
  email: z.string().describe("Attendee email"),
  optional: z.boolean().optional().describe("Whether attendance is optional"),
  responseStatus: z
    .enum(["needsAction", "declined", "tentative", "accepted"])
    .optional(),
});

const reminder = z.object({
  method: z.enum(["email", "popup"]),
  minutes: z.number().int(),
});

export const eventBody = {
  summary: z.string().optional().describe("Event title"),
  description: z.string().optional().describe("Event description"),
  location: z.string().optional().describe("Event location"),
  start: z
    .object({
      dateTime: z.string().optional().describe("Start datetime (RFC3339)"),
      date: z.string().optional().describe("Start date (YYYY-MM-DD) for all-day events"),
      timeZone: z.string().optional().describe("Timezone (e.g. America/New_York)"),
    })
    .optional(),
  end: z
    .object({
      dateTime: z.string().optional().describe("End datetime (RFC3339)"),
      date: z.string().optional().describe("End date (YYYY-MM-DD) for all-day events"),
      timeZone: z.string().optional().describe("Timezone (e.g. America/New_York)"),
    })
    .optional(),
  attendees: z.array(attendee).optional().describe("List of attendees"),
  recurrence: z
    .array(z.string())
    .optional()
    .describe('RRULE strings (e.g. ["RRULE:FREQ=WEEKLY;COUNT=5"])'),
  reminders: z
    .object({
      useDefault: z.boolean().optional(),
      overrides: z.array(reminder).optional(),
    })
    .optional(),
  colorId: z.string().optional().describe("Color ID (1-11)"),
  visibility: z
    .enum(["default", "public", "private", "confidential"])
    .optional(),
  transparency: z.enum(["opaque", "transparent"]).optional(),
  guestsCanModify: z.boolean().optional(),
  guestsCanInviteOthers: z.boolean().optional(),
  guestsCanSeeOtherGuests: z.boolean().optional(),
};

// ── Per-tool schemas ──

export const listEventsSchema = z.object({
  calendarId,
  ...timeRange,
  maxResults,
  pageToken,
  q: z.string().optional().describe("Free-text search query"),
  singleEvents: z
    .boolean()
    .default(true)
    .describe("Expand recurring events into instances"),
  orderBy: z
    .enum(["startTime", "updated"])
    .default("startTime")
    .describe("Sort order (requires singleEvents=true for startTime)"),
  showDeleted: z.boolean().optional(),
});

export const getEventSchema = z.object({
  calendarId,
  eventId,
});

export const createEventSchema = z.object({
  calendarId,
  sendUpdates,
  conferenceDataVersion: z
    .number()
    .int()
    .optional()
    .describe("Set to 1 to enable conference (Meet) creation"),
  ...eventBody,
});

export const updateEventSchema = z.object({
  calendarId,
  eventId,
  sendUpdates,
  ...eventBody,
});

export const patchEventSchema = z.object({
  calendarId,
  eventId,
  sendUpdates,
  ...eventBody,
});

export const deleteEventSchema = z.object({
  calendarId,
  eventId,
  sendUpdates,
});

export const moveEventSchema = z.object({
  calendarId,
  eventId,
  destination: z.string().describe("Destination calendar ID"),
  sendUpdates,
});

export const quickAddSchema = z.object({
  calendarId,
  text: z
    .string()
    .describe(
      'Quick-add text (e.g. "Meeting with Bob tomorrow at 3pm for 1 hour")'
    ),
  sendUpdates,
});

export const importEventSchema = z.object({
  calendarId,
  iCalUID: z.string().describe("iCalendar UID of the event"),
  ...eventBody,
});

export const listInstancesSchema = z.object({
  calendarId,
  eventId,
  ...timeRange,
  maxResults,
  pageToken,
});

export const rsvpSchema = z.object({
  calendarId,
  eventId,
  responseStatus: z.enum(["accepted", "declined", "tentative"]),
});

export const searchEventsSchema = z.object({
  calendarId,
  q: z.string().describe("Search query"),
  ...timeRange,
  maxResults,
  pageToken,
});

export const watchEventsSchema = z.object({
  calendarId,
  channelId: z.string().describe("Unique channel ID"),
  address: z.string().describe("Webhook URL to receive notifications"),
  ttl: z.number().int().optional().describe("Time-to-live in seconds"),
});

export const batchEventsSchema = z.object({
  calendarId,
  operations: z.array(
    z.object({
      method: z.enum(["create", "update", "delete"]),
      eventId: z.string().optional(),
      body: z.record(z.string(), z.unknown()).optional(),
    })
  ),
});

// ── Calendar schemas ──

export const listCalendarsSchema = z.object({
  pageToken,
  maxResults: z.number().int().optional(),
});

export const getCalendarSchema = z.object({
  calendarId,
});

export const createCalendarSchema = z.object({
  summary: z.string().describe("Calendar name"),
  description: z.string().optional(),
  timeZone: z.string().optional(),
});

export const updateCalendarSchema = z.object({
  calendarId,
  summary: z.string().optional(),
  description: z.string().optional(),
  timeZone: z.string().optional(),
});

export const deleteCalendarSchema = z.object({
  calendarId,
});

export const clearCalendarSchema = z.object({
  calendarId,
});

// ── Calendar List schemas ──

export const getCalendarEntrySchema = z.object({
  calendarId,
});

export const updateCalendarEntrySchema = z.object({
  calendarId,
  defaultReminders: z.array(reminder).optional(),
  backgroundColor: z.string().optional(),
  foregroundColor: z.string().optional(),
  hidden: z.boolean().optional(),
  selected: z.boolean().optional(),
  summaryOverride: z.string().optional(),
  colorRgbFormat: z.boolean().optional(),
  notificationSettings: z
    .object({
      notifications: z
        .array(
          z.object({
            method: z.enum(["email"]),
            type: z.enum([
              "eventCreation",
              "eventChange",
              "eventCancellation",
              "eventResponse",
              "agenda",
            ]),
          })
        )
        .optional(),
    })
    .optional(),
});

export const addCalendarSchema = z.object({
  id: z.string().describe("Calendar ID to add to the list"),
  backgroundColor: z.string().optional(),
  foregroundColor: z.string().optional(),
  hidden: z.boolean().optional(),
  selected: z.boolean().optional(),
  summaryOverride: z.string().optional(),
  colorRgbFormat: z.boolean().optional(),
});

export const removeCalendarSchema = z.object({
  calendarId,
});

// ── Sharing (ACL) schemas ──

export const listSharingRulesSchema = z.object({
  calendarId,
  pageToken,
  maxResults: z.number().int().optional(),
});

export const shareCalendarSchema = z.object({
  calendarId,
  role: z.enum(["none", "freeBusyReader", "reader", "writer", "owner"]),
  scope: z.object({
    type: z.enum(["default", "user", "group", "domain"]),
    value: z.string().optional().describe("Email or domain"),
  }),
  sendNotifications: z.boolean().default(true),
});

export const updateSharingSchema = z.object({
  calendarId,
  ruleId: z.string().describe("ACL rule ID"),
  role: z.enum(["none", "freeBusyReader", "reader", "writer", "owner"]),
  sendNotifications: z.boolean().default(true),
});

export const unshareCalendarSchema = z.object({
  calendarId,
  ruleId: z.string().describe("ACL rule ID to remove"),
});

// ── Free/Busy ──

export const findFreeBusySchema = z.object({
  timeMin: z.string().describe("Start time (RFC3339)"),
  timeMax: z.string().describe("End time (RFC3339)"),
  items: z
    .array(z.object({ id: z.string() }))
    .describe("Calendar IDs to check"),
  timeZone: z.string().optional(),
});

// ── Settings ──

export const getSettingsSchema = z.object({
  pageToken,
  maxResults: z.number().int().optional(),
});

export const getSettingSchema = z.object({
  setting: z.string().describe("Setting ID (e.g. timezone, locale)"),
});

// ── Colors ──

export const getColorsSchema = z.object({});

// ── Notifications ──

export const stopWatchingSchema = z.object({
  channelId: z.string().describe("Channel ID to stop"),
  resourceId: z.string().describe("Resource ID from watch response"),
});
