// ---------------------------------------------------------------------------
// Command Poller
//
// Polls the `session_commands` table every 3 seconds for pending commands
// from the web UI (stop, respond). Commands are claimed atomically via
// UPDATE...RETURNING to prevent double-processing across instances.
// ---------------------------------------------------------------------------

import { supabase } from "./db.js";
import * as db from "./db.js";
import { findRunningSessionBySessionId } from "./session-registry.js";
import { resumeSession } from "./agent.js";
import { logger } from "./logger.js";

const POLL_INTERVAL_MS = 3_000; // 3 seconds
let intervalHandle: ReturnType<typeof setInterval> | null = null;

interface SessionCommand {
  id: string;
  session_id: string;
  command: "stop" | "respond" | "resume" | "start";
  payload: Record<string, unknown> | null;
  status: string;
  created_by: string;
  created_at: string;
  processed_at: string | null;
}

// ---------------------------------------------------------------------------
// Mark a command as completed or failed
// ---------------------------------------------------------------------------

async function markCommand(
  id: string,
  status: "completed" | "failed",
): Promise<void> {
  const { error } = await supabase
    .from("session_commands")
    .update({ status, processed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    logger.error({ err: error, commandId: id, status }, "[command-poller] failed to mark command");
  }
}

// ---------------------------------------------------------------------------
// Process a single command
// ---------------------------------------------------------------------------

async function processCommand(command: SessionCommand): Promise<void> {
  switch (command.command) {
    case "stop": {
      const running = findRunningSessionBySessionId(command.session_id);
      if (!running) {
        // Session not on this instance or already done
        await markCommand(command.id, "failed");
        return;
      }

      running.killedByUser = true;
      if (running.abortController) {
        running.abortController.abort();
      }
      running.close();
      await markCommand(command.id, "completed");

      logger.info(
        { sessionId: command.session_id, commandId: command.id, createdBy: command.created_by },
        "[command-poller] stopped session",
      );
      break;
    }

    case "respond": {
      const running = findRunningSessionBySessionId(command.session_id);

      if (!running) {
        // No in-memory process — check if session is idle (orphaned after timeout/restart)
        const session = await db.getSessionById(command.session_id);
        if (session && session.status === "idle") {
          const message = command.payload?.message as string;
          if (!message) {
            logger.warn({ commandId: command.id }, "[command-poller] respond command missing message payload");
            await markCommand(command.id, "failed");
            return;
          }

          const lookup = await db.lookupUserById(session.user_id);
          if (!lookup) {
            logger.warn({ userId: session.user_id, commandId: command.id }, "[command-poller] respond: user lookup failed for orphaned idle session");
            await markCommand(command.id, "failed");
            return;
          }

          // Reset close_requested and set to pending, then resume
          await db.updateSession(command.session_id, { status: "pending", close_requested: false });
          await markCommand(command.id, "completed");
          resumeSession(command.session_id, lookup, message).catch((err) => {
            logger.error({ err, sessionId: command.session_id }, "[command-poller] resumeSession for orphaned idle threw");
          });

          logger.info(
            { sessionId: command.session_id, commandId: command.id },
            "[command-poller] resumed orphaned idle session via respond",
          );
          return;
        }

        await markCommand(command.id, "failed");
        return;
      }

      const message = command.payload?.message as string;
      if (!message) {
        logger.warn({ commandId: command.id }, "[command-poller] respond command missing message payload");
        await markCommand(command.id, "failed");
        return;
      }

      // Push message into the running session
      const pushed = running.pushMessage({
        text: message,
        messageTs: `web-${Date.now()}`,
        resolve: () => {},
      });

      if (pushed) {
        await markCommand(command.id, "completed");
        logger.info(
          { sessionId: command.session_id, commandId: command.id },
          "[command-poller] injected respond message",
        );
      } else {
        await markCommand(command.id, "failed");
        logger.warn(
          { sessionId: command.session_id, commandId: command.id },
          "[command-poller] pushMessage returned false",
        );
      }
      break;
    }

    case "resume": {
      const session = await db.getSessionById(command.session_id);
      if (!session || session.status !== "pending") {
        logger.warn(
          { sessionId: command.session_id, status: session?.status, commandId: command.id },
          "[command-poller] resume: session not found or not pending",
        );
        await markCommand(command.id, "failed");
        return;
      }

      const message = command.payload?.message as string;
      if (!message) {
        logger.warn({ commandId: command.id }, "[command-poller] resume command missing message payload");
        await markCommand(command.id, "failed");
        return;
      }

      const lookup = await db.lookupUserById(session.user_id);
      if (!lookup) {
        logger.warn({ userId: session.user_id, commandId: command.id }, "[command-poller] resume: user lookup failed");
        await markCommand(command.id, "failed");
        return;
      }

      // Fire-and-forget: mark command completed and kick off resume
      await markCommand(command.id, "completed");
      resumeSession(command.session_id, lookup, message).catch((err) => {
        logger.error({ err, sessionId: command.session_id }, "[command-poller] resumeSession threw");
      });

      logger.info(
        { sessionId: command.session_id, commandId: command.id, createdBy: command.created_by },
        "[command-poller] resume initiated",
      );
      break;
    }

    case "start": {
      const session = await db.getSessionById(command.session_id);
      if (!session || session.status !== "pending") {
        logger.warn(
          { sessionId: command.session_id, status: session?.status, commandId: command.id },
          "[command-poller] start: session not found or not pending",
        );
        await markCommand(command.id, "failed");
        return;
      }

      const lookup = await db.lookupUserById(session.user_id);
      if (!lookup) {
        logger.warn({ userId: session.user_id, commandId: command.id }, "[command-poller] start: user lookup failed");
        await markCommand(command.id, "failed");
        return;
      }

      await markCommand(command.id, "completed");
      resumeSession(command.session_id, lookup, session.prompt).catch((err) => {
        logger.error({ err, sessionId: command.session_id }, "[command-poller] start threw");
      });

      logger.info(
        { sessionId: command.session_id, commandId: command.id, createdBy: command.created_by },
        "[command-poller] start initiated",
      );
      break;
    }

    default:
      logger.warn({ command: command.command, commandId: command.id }, "[command-poller] unknown command type");
      await markCommand(command.id, "failed");
  }
}

// ---------------------------------------------------------------------------
// Poll loop: claim and process pending commands
// ---------------------------------------------------------------------------

async function pollCommands(): Promise<void> {
  try {
    // Atomically claim pending commands
    const { data: commands, error } = await supabase
      .from("session_commands")
      .update({ status: "processing" })
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10)
      .select("*");

    if (error) {
      logger.error({ err: error }, "[command-poller] failed to claim commands");
      return;
    }

    if (!commands || commands.length === 0) return;

    logger.debug({ count: commands.length }, "[command-poller] claimed commands");

    for (const command of commands as SessionCommand[]) {
      await processCommand(command);
    }
  } catch (err) {
    logger.error({ err }, "[command-poller] poll error");
  }
}

// ---------------------------------------------------------------------------
// Start / Stop
// ---------------------------------------------------------------------------

export function startCommandPoller(): void {
  logger.info(
    { intervalMs: POLL_INTERVAL_MS },
    "[command-poller] started",
  );

  intervalHandle = setInterval(() => {
    pollCommands().catch((err) =>
      logger.error({ err }, "[command-poller] poll error"),
    );
  }, POLL_INTERVAL_MS);

  // Run immediately on startup to pick up any queued commands
  pollCommands().catch((err) =>
    logger.error({ err }, "[command-poller] initial poll error"),
  );
}

export function stopCommandPoller(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info("[command-poller] stopped");
  }
}
