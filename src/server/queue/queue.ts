import crypto from "node:crypto";

import { Queue } from "bullmq";

import { statusStore } from "@/server/store/statusStore";

export type SendTextJob = {
  type: "text";
  sessionId: string;
  to: string;
  text: string;
};

export type SendMediaJob = {
  type: "media";
  sessionId: string;
  to: string;
  caption?: string;
  mediaUrl: string;
  filename?: string;
};

export type SendJob = SendTextJob | SendMediaJob;
export type SendJobName = "send-text" | "send-media";

export const queueName = "whatsapp-message-queue";

function parseRedisUrl(url: string) {
  try {
    const parsed = new URL(url);
    const options: Record<string, unknown> = {
      host: parsed.hostname || "localhost",
      port: parseInt(parsed.port || "6379", 10),
      maxRetriesPerRequest: null,
    };
    if (parsed.password) options.password = decodeURIComponent(parsed.password);
    if (parsed.username && parsed.username !== "default")
      options.username = decodeURIComponent(parsed.username);
    const db = parsed.pathname?.slice(1);
    if (db) options.db = parseInt(db, 10);
    return options;
  } catch {
    return { host: "localhost", port: 6379, maxRetriesPerRequest: null };
  }
}

export const redisConnection = parseRedisUrl(
  process.env.REDIS_URL || "redis://localhost:6379",
);

export class QueueUnavailableError extends Error {
  constructor(message = "Queue is unavailable") {
    super(message);
    this.name = "QueueUnavailableError";
  }
}

export function isQueueUnavailableError(error: unknown) {
  return error instanceof QueueUnavailableError;
}

function classifyQueueError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT") ||
    message.includes("Connection is closed") ||
    message.includes("Redis")
  ) {
    return new QueueUnavailableError("Queue backend unavailable. Try again shortly.");
  }

  return error;
}

let messageQueue: Queue<SendJob, unknown, SendJobName> | null = null;

function getMessageQueue() {
  if (!messageQueue) {
    messageQueue = new Queue<SendJob, unknown, SendJobName>(queueName, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 4,
        backoff: {
          type: "exponential",
          delay: 2_000,
        },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });
  }

  return messageQueue;
}

async function isQueueWorkerAvailable(): Promise<boolean> {
  try {
    const workers = await getMessageQueue().getWorkers();
    return workers.length > 0;
  } catch {
    return false;
  }
}

/**
 * Fallback: send directly through the session manager when the queue is
 * unavailable (no Redis or no worker process).  This makes the dev and single-
 * process setups work out of the box.
 */
async function sendDirect(payload: SendJob): Promise<{ jobId: string }> {
  // Lazy-import to avoid circular dependency at module level
  const { sessionManager } = await import("@/server/whatsapp/manager");
  const jobId = `direct-${crypto.randomUUID()}`;

  if (payload.type === "text") {
    const sent = await sessionManager.sendText(payload.sessionId, payload.to, payload.text);
    statusStore.addJobLog({
      jobId: sent.id._serialized,
      sessionId: payload.sessionId,
      type: "text",
      status: "success",
      message: `Sent text to ${payload.to} (direct, no queue)`,
    });
  } else {
    const sent = await sessionManager.sendMedia(payload);
    statusStore.addJobLog({
      jobId: sent.id._serialized,
      sessionId: payload.sessionId,
      type: "media",
      status: "success",
      message: `Sent media to ${payload.to} (direct, no queue)`,
    });
  }

  return { jobId };
}

export async function enqueueTextJob(payload: Omit<SendTextJob, "type">) {
  const jobId = crypto.randomUUID();
  const fullPayload: SendTextJob = { ...payload, type: "text" };

  // Try queue first; fall back to direct send
  const workerReady = await isQueueWorkerAvailable();
  if (!workerReady) {
    console.info("[queue] No active worker detected — sending directly");
    return sendDirect(fullPayload);
  }

  let job;
  try {
    job = await getMessageQueue().add("send-text", fullPayload, { jobId });
  } catch (error) {
    console.warn("[queue] Queue add failed, falling back to direct send:", error);
    return sendDirect(fullPayload);
  }

  return { jobId: job.id?.toString() ?? jobId };
}

export async function enqueueMediaJob(payload: Omit<SendMediaJob, "type">) {
  const jobId = crypto.randomUUID();
  const fullPayload: SendMediaJob = { ...payload, type: "media" };

  const workerReady = await isQueueWorkerAvailable();
  if (!workerReady) {
    console.info("[queue] No active worker detected — sending directly");
    return sendDirect(fullPayload);
  }

  let job;
  try {
    job = await getMessageQueue().add("send-media", fullPayload, { jobId });
  } catch (error) {
    console.warn("[queue] Queue add failed, falling back to direct send:", error);
    return sendDirect(fullPayload);
  }

  return { jobId: job.id?.toString() ?? jobId };
}
