import type { calendar_v3 } from "@googleapis/calendar";
import type { IntegrationToolDef } from "../types";
import * as s from "./schemas";

type CalendarToolDef = Omit<IntegrationToolDef, "execute"> & {
  execute: (
    args: Record<string, unknown>,
    cal: calendar_v3.Calendar
  ) => Promise<unknown>;
};

// Helper: pick calendarId out of args, default to "primary"
function cid(args: Record<string, unknown>): string {
  return (args.calendarId as string) ?? "primary";
}

export const CALENDAR_TOOLS: CalendarToolDef[] = [
  // ── Events (14) ──
  {
    name: "google_calendar_list_events",
    description:
      "List events from a calendar with optional time range, search, and pagination",
    schema: s.listEventsSchema,
    execute: (a, c) =>
      c.events
        .list({
          calendarId: cid(a),
          timeMin: a.timeMin as string | undefined,
          timeMax: a.timeMax as string | undefined,
          maxResults: a.maxResults as number | undefined,
          pageToken: a.pageToken as string | undefined,
          q: a.q as string | undefined,
          singleEvents: a.singleEvents as boolean | undefined,
          orderBy: a.orderBy as string | undefined,
          showDeleted: a.showDeleted as boolean | undefined,
        })
        .then((r) => r.data),
  },
  {
    name: "google_calendar_get_event",
    description: "Get a single event by ID",
    schema: s.getEventSchema,
    execute: (a, c) =>
      c.events
        .get({ calendarId: cid(a), eventId: a.eventId as string })
        .then((r) => r.data),
  },
  {
    name: "google_calendar_create_event",
    description: "Create a new calendar event",
    schema: s.createEventSchema,
    execute: (a, c) => {
      const { calendarId: cal, sendUpdates, conferenceDataVersion, ...body } = a;
      return c.events
        .insert({
          calendarId: cid(a),
          sendUpdates: sendUpdates as string | undefined,
          conferenceDataVersion: conferenceDataVersion as number | undefined,
          requestBody: body,
        })
        .then((r) => r.data);
    },
  },
  {
    name: "google_calendar_update_event",
    description: "Replace an existing event (full update)",
    schema: s.updateEventSchema,
    execute: (a, c) => {
      const { calendarId: cal, eventId, sendUpdates, ...body } = a;
      return c.events
        .update({
          calendarId: cid(a),
          eventId: eventId as string,
          sendUpdates: sendUpdates as string | undefined,
          requestBody: body,
        })
        .then((r) => r.data);
    },
  },
  {
    name: "google_calendar_patch_event",
    description: "Partially update an event (only changed fields)",
    schema: s.patchEventSchema,
    execute: (a, c) => {
      const { calendarId: cal, eventId, sendUpdates, ...body } = a;
      return c.events
        .patch({
          calendarId: cid(a),
          eventId: eventId as string,
          sendUpdates: sendUpdates as string | undefined,
          requestBody: body,
        })
        .then((r) => r.data);
    },
  },
  {
    name: "google_calendar_delete_event",
    description: "Delete an event",
    schema: s.deleteEventSchema,
    execute: (a, c) =>
      c.events
        .delete({
          calendarId: cid(a),
          eventId: a.eventId as string,
          sendUpdates: a.sendUpdates as string | undefined,
        })
        .then(() => ({ success: true })),
  },
  {
    name: "google_calendar_move_event",
    description: "Move an event to a different calendar",
    schema: s.moveEventSchema,
    execute: (a, c) =>
      c.events
        .move({
          calendarId: cid(a),
          eventId: a.eventId as string,
          destination: a.destination as string,
          sendUpdates: a.sendUpdates as string | undefined,
        })
        .then((r) => r.data),
  },
  {
    name: "google_calendar_quick_add",
    description:
      'Create an event from a text string (e.g. "Lunch with Bob tomorrow at noon")',
    schema: s.quickAddSchema,
    execute: (a, c) =>
      c.events
        .quickAdd({
          calendarId: cid(a),
          text: a.text as string,
          sendUpdates: a.sendUpdates as string | undefined,
        })
        .then((r) => r.data),
  },
  {
    name: "google_calendar_import_event",
    description: "Import an event by iCalendar UID",
    schema: s.importEventSchema,
    execute: (a, c) => {
      const { calendarId: cal, iCalUID, ...body } = a;
      return c.events
        .import({
          calendarId: cid(a),
          requestBody: { iCalUID: iCalUID as string, ...body },
        })
        .then((r) => r.data);
    },
  },
  {
    name: "google_calendar_list_recurring_instances",
    description: "List all instances of a recurring event",
    schema: s.listInstancesSchema,
    execute: (a, c) =>
      c.events
        .instances({
          calendarId: cid(a),
          eventId: a.eventId as string,
          timeMin: a.timeMin as string | undefined,
          timeMax: a.timeMax as string | undefined,
          maxResults: a.maxResults as number | undefined,
          pageToken: a.pageToken as string | undefined,
        })
        .then((r) => r.data),
  },
  {
    name: "google_calendar_rsvp",
    description: "RSVP to an event (accept, decline, or tentative)",
    schema: s.rsvpSchema,
    execute: async (a, c) => {
      const event = await c.events.get({
        calendarId: cid(a),
        eventId: a.eventId as string,
      });
      const me = event.data.attendees?.find((att) => att.self);
      if (me) me.responseStatus = a.responseStatus as string;
      return c.events
        .patch({
          calendarId: cid(a),
          eventId: a.eventId as string,
          requestBody: { attendees: event.data.attendees },
        })
        .then((r) => r.data);
    },
  },
  {
    name: "google_calendar_search_events",
    description: "Search events by text query across a calendar",
    schema: s.searchEventsSchema,
    execute: (a, c) =>
      c.events
        .list({
          calendarId: cid(a),
          q: a.q as string,
          timeMin: a.timeMin as string | undefined,
          timeMax: a.timeMax as string | undefined,
          maxResults: a.maxResults as number | undefined,
          pageToken: a.pageToken as string | undefined,
          singleEvents: true,
          orderBy: "startTime",
        })
        .then((r) => r.data),
  },
  {
    name: "google_calendar_watch_events",
    description: "Set up push notifications for event changes",
    schema: s.watchEventsSchema,
    execute: (a, c) =>
      c.events
        .watch({
          calendarId: cid(a),
          requestBody: {
            id: a.channelId as string,
            type: "web_hook",
            address: a.address as string,
            params: a.ttl
              ? { ttl: String(a.ttl) }
              : undefined,
          },
        })
        .then((r) => r.data),
  },
  {
    name: "google_calendar_batch_events",
    description:
      "Batch create, update, or delete multiple events in one call",
    schema: s.batchEventsSchema,
    execute: async (a, c) => {
      const ops = a.operations as Array<{
        method: string;
        eventId?: string;
        body?: Record<string, unknown>;
      }>;
      const results = [];
      for (const op of ops) {
        if (op.method === "create") {
          const r = await c.events.insert({
            calendarId: cid(a),
            requestBody: op.body,
          });
          results.push({ method: "create", data: r.data });
        } else if (op.method === "update" && op.eventId) {
          const r = await c.events.patch({
            calendarId: cid(a),
            eventId: op.eventId,
            requestBody: op.body,
          });
          results.push({ method: "update", data: r.data });
        } else if (op.method === "delete" && op.eventId) {
          await c.events.delete({
            calendarId: cid(a),
            eventId: op.eventId,
          });
          results.push({ method: "delete", eventId: op.eventId, success: true });
        }
      }
      return results;
    },
  },

  // ── Calendars (6) ──
  {
    name: "google_calendar_list_calendars",
    description: "List all calendars the user has access to",
    schema: s.listCalendarsSchema,
    execute: (a, c) =>
      c.calendarList
        .list({
          pageToken: a.pageToken as string | undefined,
          maxResults: a.maxResults as number | undefined,
        })
        .then((r) => r.data),
  },
  {
    name: "google_calendar_get_calendar",
    description: "Get metadata for a specific calendar",
    schema: s.getCalendarSchema,
    execute: (a, c) =>
      c.calendars.get({ calendarId: cid(a) }).then((r) => r.data),
  },
  {
    name: "google_calendar_create_calendar",
    description: "Create a new secondary calendar",
    schema: s.createCalendarSchema,
    execute: (a, c) =>
      c.calendars
        .insert({
          requestBody: {
            summary: a.summary as string,
            description: a.description as string | undefined,
            timeZone: a.timeZone as string | undefined,
          },
        })
        .then((r) => r.data),
  },
  {
    name: "google_calendar_update_calendar",
    description: "Update a calendar's metadata",
    schema: s.updateCalendarSchema,
    execute: (a, c) =>
      c.calendars
        .patch({
          calendarId: cid(a),
          requestBody: {
            summary: a.summary as string | undefined,
            description: a.description as string | undefined,
            timeZone: a.timeZone as string | undefined,
          },
        })
        .then((r) => r.data),
  },
  {
    name: "google_calendar_delete_calendar",
    description: "Delete a secondary calendar (cannot delete primary)",
    schema: s.deleteCalendarSchema,
    execute: (a, c) =>
      c.calendars
        .delete({ calendarId: cid(a) })
        .then(() => ({ success: true })),
  },
  {
    name: "google_calendar_clear_calendar",
    description:
      "Clear all events from a calendar (only works on primary calendar)",
    schema: s.clearCalendarSchema,
    execute: (a, c) =>
      c.calendars
        .clear({ calendarId: cid(a) })
        .then(() => ({ success: true })),
  },

  // ── Calendar List (4) ──
  {
    name: "google_calendar_get_calendar_entry",
    description: "Get a calendar's entry from the user's calendar list",
    schema: s.getCalendarEntrySchema,
    execute: (a, c) =>
      c.calendarList.get({ calendarId: cid(a) }).then((r) => r.data),
  },
  {
    name: "google_calendar_update_calendar_entry",
    description:
      "Update display settings for a calendar (colors, visibility, reminders)",
    schema: s.updateCalendarEntrySchema,
    execute: (a, c) => {
      const { calendarId: cal, ...body } = a;
      return c.calendarList
        .patch({
          calendarId: cid(a),
          colorRgbFormat: body.colorRgbFormat as boolean | undefined,
          requestBody: body,
        })
        .then((r) => r.data);
    },
  },
  {
    name: "google_calendar_add_calendar",
    description: "Add an existing calendar to the user's calendar list",
    schema: s.addCalendarSchema,
    execute: (a, c) =>
      c.calendarList
        .insert({
          colorRgbFormat: a.colorRgbFormat as boolean | undefined,
          requestBody: {
            id: a.id as string,
            backgroundColor: a.backgroundColor as string | undefined,
            foregroundColor: a.foregroundColor as string | undefined,
            hidden: a.hidden as boolean | undefined,
            selected: a.selected as boolean | undefined,
            summaryOverride: a.summaryOverride as string | undefined,
          },
        })
        .then((r) => r.data),
  },
  {
    name: "google_calendar_remove_calendar",
    description: "Remove a calendar from the user's calendar list",
    schema: s.removeCalendarSchema,
    execute: (a, c) =>
      c.calendarList
        .delete({ calendarId: cid(a) })
        .then(() => ({ success: true })),
  },

  // ── Sharing / ACL (4) ──
  {
    name: "google_calendar_list_sharing_rules",
    description: "List access control rules for a calendar",
    schema: s.listSharingRulesSchema,
    execute: (a, c) =>
      c.acl
        .list({
          calendarId: cid(a),
          pageToken: a.pageToken as string | undefined,
          maxResults: a.maxResults as number | undefined,
        })
        .then((r) => r.data),
  },
  {
    name: "google_calendar_share_calendar",
    description: "Share a calendar with a user, group, or domain",
    schema: s.shareCalendarSchema,
    execute: (a, c) =>
      c.acl
        .insert({
          calendarId: cid(a),
          sendNotifications: a.sendNotifications as boolean | undefined,
          requestBody: {
            role: a.role as string,
            scope: a.scope as { type: string; value?: string },
          },
        })
        .then((r) => r.data),
  },
  {
    name: "google_calendar_update_sharing",
    description: "Update an existing sharing rule",
    schema: s.updateSharingSchema,
    execute: (a, c) =>
      c.acl
        .patch({
          calendarId: cid(a),
          ruleId: a.ruleId as string,
          sendNotifications: a.sendNotifications as boolean | undefined,
          requestBody: { role: a.role as string },
        })
        .then((r) => r.data),
  },
  {
    name: "google_calendar_unshare_calendar",
    description: "Remove a sharing rule from a calendar",
    schema: s.unshareCalendarSchema,
    execute: (a, c) =>
      c.acl
        .delete({ calendarId: cid(a), ruleId: a.ruleId as string })
        .then(() => ({ success: true })),
  },

  // ── Availability (1) ──
  {
    name: "google_calendar_find_free_busy",
    description: "Find free/busy information for a set of calendars",
    schema: s.findFreeBusySchema,
    execute: (a, c) =>
      c.freebusy
        .query({
          requestBody: {
            timeMin: a.timeMin as string,
            timeMax: a.timeMax as string,
            timeZone: a.timeZone as string | undefined,
            items: a.items as Array<{ id: string }>,
          },
        })
        .then((r) => r.data),
  },

  // ── Settings (2) ──
  {
    name: "google_calendar_get_settings",
    description: "List all user calendar settings",
    schema: s.getSettingsSchema,
    execute: (a, c) =>
      c.settings
        .list({
          pageToken: a.pageToken as string | undefined,
          maxResults: a.maxResults as number | undefined,
        })
        .then((r) => r.data),
  },
  {
    name: "google_calendar_get_setting",
    description: "Get a specific calendar setting by ID",
    schema: s.getSettingSchema,
    execute: (a, c) =>
      c.settings
        .get({ setting: a.setting as string })
        .then((r) => r.data),
  },

  // ── Colors (1) ──
  {
    name: "google_calendar_get_colors",
    description: "Get the color definitions for calendars and events",
    schema: s.getColorsSchema,
    execute: (_a, c) => c.colors.get().then((r) => r.data),
  },

  // ── Notifications (1) ──
  {
    name: "google_calendar_stop_watching",
    description: "Stop receiving push notifications for a channel",
    schema: s.stopWatchingSchema,
    execute: (a, c) =>
      c.channels
        .stop({
          requestBody: {
            id: a.channelId as string,
            resourceId: a.resourceId as string,
          },
        })
        .then(() => ({ success: true })),
  },
];
