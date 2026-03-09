// ---------------------------------------------------------------------------
// Redis infrastructure for multi-instance scaling
//
// When REDIS_URL is set, provides:
//   - Distributed event deduplication
//   - Session-to-instance mapping + pub/sub follow-up routing
//   - Distributed scheduler lock
//   - Per-instance capacity tracking
//   - Instance heartbeat & dead instance cleanup
//
// When REDIS_URL is not set, all functions gracefully fall back to allow
// single-instance operation (existing behavior).
// ---------------------------------------------------------------------------

import { Redis } from "ioredis";
import { logger } from "./logger.js";

const INSTANCE_ID = crypto.randomUUID();

let redis: Redis | null = null;
let subscriber: Redis | null = null;
let isEnabled = false;
let heartbeatInterval: NodeJS.Timeout | null = null;

/** Follow-up message payload for inter-instance communication */
export type FollowUpPayload = {
  threadKey: string;
  sessionId: string;
  slackUserId: string;
  text: string;
  files: unknown[];
  messageTs: string;
};

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

function initRedis(): void {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.info("Redis not configured (REDIS_URL not set), running in single-instance mode");
    return;
  }

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    subscriber = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redis.on("connect", () => {
      logger.info({ instanceId: INSTANCE_ID }, "Redis connected");
      isEnabled = true;
    });

    redis.on("error", (err: Error) => {
      logger.error({ error: err.message }, "Redis connection error");
      isEnabled = false;
    });

    subscriber.on("error", (err: Error) => {
      logger.error({ error: err.message }, "Redis subscriber error");
    });

    redis.connect().catch((err: Error) => {
      logger.error({ error: err.message }, "Failed to connect to Redis");
    });

    subscriber.connect().catch((err: Error) => {
      logger.error({ error: err.message }, "Failed to connect Redis subscriber");
    });
  } catch (error) {
    logger.error({ error }, "Failed to initialize Redis");
  }
}

// Initialize on module load
initRedis();

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

export function isRedisEnabled(): boolean {
  return isEnabled && redis !== null && redis.status === "ready";
}

export function getRedis(): Redis | null {
  return isRedisEnabled() ? redis : null;
}

export function getInstanceId(): string {
  return INSTANCE_ID;
}

// ---------------------------------------------------------------------------
// Event deduplication (replaces in-memory Set)
// ---------------------------------------------------------------------------

export async function markProcessedRedis(eventId: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return true;
  try {
    const result = await r.set(`event:${eventId}`, "1", "EX", 300, "NX");
    return result === "OK";
  } catch (error) {
    logger.error({ error, eventId }, "Redis markProcessed failed");
    return true; // fallback: allow processing
  }
}

// ---------------------------------------------------------------------------
// Session-to-instance mapping
// ---------------------------------------------------------------------------

export async function registerSessionRedis(threadKey: string, sessionId: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    const pipe = r.multi();
    pipe.hset(`session:${threadKey}`, "instanceId", INSTANCE_ID, "sessionId", sessionId);
    pipe.expire(`session:${threadKey}`, 5 * 60 * 60);
    await pipe.exec();
  } catch (error) {
    logger.error({ error, threadKey }, "Redis registerSession failed");
  }
}

export async function unregisterSessionRedis(threadKey: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(`session:${threadKey}`);
  } catch (error) {
    logger.error({ error, threadKey }, "Redis unregisterSession failed");
  }
}

export async function getSessionOwner(
  threadKey: string,
): Promise<{ instanceId: string; sessionId: string } | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const [instanceId, sessionId] = await r.hmget(`session:${threadKey}`, "instanceId", "sessionId");
    return instanceId && sessionId ? { instanceId, sessionId } : null;
  } catch (error) {
    logger.error({ error, threadKey }, "Redis getSessionOwner failed");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Follow-up forwarding via pub/sub
// ---------------------------------------------------------------------------

export async function publishFollowUp(
  targetInstanceId: string,
  payload: FollowUpPayload,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.publish(`followup:${targetInstanceId}`, JSON.stringify(payload));
    logger.debug({ targetInstanceId, threadKey: payload.threadKey }, "Follow-up published");
  } catch (error) {
    logger.error({ error, targetInstanceId }, "Redis publishFollowUp failed");
  }
}

export function subscribeFollowUps(handler: (payload: FollowUpPayload) => void): void {
  if (!subscriber) return;
  const channel = `followup:${INSTANCE_ID}`;

  subscriber.subscribe(channel).then(() => {
    logger.info({ channel, instanceId: INSTANCE_ID }, "Subscribed to follow-ups");
  }).catch((err: Error) => {
    logger.error({ error: err.message, channel }, "Failed to subscribe to follow-ups");
  });

  subscriber.on("message", (receivedChannel: string, message: string) => {
    if (receivedChannel !== channel) return;
    try {
      const payload = JSON.parse(message) as FollowUpPayload;
      handler(payload);
    } catch (error) {
      logger.error({ error }, "Failed to parse follow-up payload");
    }
  });
}

// ---------------------------------------------------------------------------
// Distributed scheduler lock
// ---------------------------------------------------------------------------

const RELEASE_LOCK_LUA = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end
`;

export async function tryAcquireSchedulerLock(): Promise<boolean> {
  const r = getRedis();
  if (!r) return true; // single-instance: always allow
  try {
    const result = await r.set("lock:scheduler", INSTANCE_ID, "EX", 30, "NX");
    return result === "OK";
  } catch (error) {
    logger.error({ error }, "Redis tryAcquireSchedulerLock failed");
    return false;
  }
}

export async function releaseSchedulerLock(): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.eval(RELEASE_LOCK_LUA, 1, "lock:scheduler", INSTANCE_ID);
  } catch (error) {
    logger.error({ error }, "Redis releaseSchedulerLock failed");
  }
}

// ---------------------------------------------------------------------------
// Capacity tracking
// ---------------------------------------------------------------------------

export async function incrementActiveCount(): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  try {
    return await r.incr(`instance:${INSTANCE_ID}:count`);
  } catch (error) {
    logger.error({ error }, "Redis incrementActiveCount failed");
    return 0;
  }
}

export async function decrementActiveCount(): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  try {
    const count = await r.decr(`instance:${INSTANCE_ID}:count`);
    return Math.max(0, count);
  } catch (error) {
    logger.error({ error }, "Redis decrementActiveCount failed");
    return 0;
  }
}

export async function getGlobalActiveCount(): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  try {
    let total = 0;
    let cursor = "0";
    do {
      const [nextCursor, keys] = await r.scan(cursor, "MATCH", "instance:*:count");
      cursor = nextCursor;
      if (keys.length > 0) {
        const values = await r.mget(...keys);
        total += values.reduce((sum: number, val: string | null) => sum + (parseInt(val || "0") || 0), 0);
      }
    } while (cursor !== "0");
    return total;
  } catch (error) {
    logger.error({ error }, "Redis getGlobalActiveCount failed");
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

export async function sendHeartbeat(): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(`instance:${INSTANCE_ID}:heartbeat`, Date.now().toString(), "EX", 120);
  } catch (error) {
    logger.error({ error }, "Redis sendHeartbeat failed");
  }
}

export function startHeartbeatLoop(): void {
  if (heartbeatInterval) return;
  sendHeartbeat().catch(() => {});
  heartbeatInterval = setInterval(() => {
    sendHeartbeat().catch(() => {});
  }, 30_000);
  logger.info({ instanceId: INSTANCE_ID }, "Heartbeat loop started");
}

// ---------------------------------------------------------------------------
// Dead instance cleanup
// ---------------------------------------------------------------------------

export async function cleanupDeadInstance(instanceId: string): Promise<string[]> {
  const r = getRedis();
  if (!r) return [];
  try {
    const cleaned: string[] = [];
    let cursor = "0";
    do {
      const [nextCursor, keys] = await r.scan(cursor, "MATCH", "session:*");
      cursor = nextCursor;
      for (const key of keys) {
        const owner = await r.hget(key, "instanceId");
        if (owner === instanceId) {
          await r.del(key);
          cleaned.push(key.replace("session:", ""));
        }
      }
    } while (cursor !== "0");

    await r.del(`instance:${instanceId}:count`, `instance:${instanceId}:heartbeat`);
    if (cleaned.length > 0) {
      logger.info({ instanceId, cleaned: cleaned.length }, "Cleaned up dead instance");
    }
    return cleaned;
  } catch (error) {
    logger.error({ error, instanceId }, "Redis cleanupDeadInstance failed");
    return [];
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function redisHealthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
  const r = getRedis();
  if (!r) return { ok: !process.env.REDIS_URL, latencyMs: 0 };
  try {
    const start = Date.now();
    await r.ping();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    logger.error({ error }, "Redis health check failed");
    return { ok: false, latencyMs: 0 };
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

export async function shutdownRedis(): Promise<void> {
  logger.info({ instanceId: INSTANCE_ID }, "Shutting down Redis");
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  try {
    const r = getRedis();
    if (r) {
      await r.set(`instance:${INSTANCE_ID}:count`, "0");
      await r.del(`instance:${INSTANCE_ID}:heartbeat`);
    }
    if (redis) { await redis.disconnect(); redis = null; }
    if (subscriber) { await subscriber.disconnect(); subscriber = null; }
    isEnabled = false;
  } catch (error) {
    logger.error({ error }, "Redis shutdown error");
  }
}
