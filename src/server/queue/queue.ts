import crypto from "node:crypto";

import { Queue } from "bullmq";

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

export const redisConnection = {
  url: process.env.REDIS_URL || "redis://localhost:6379",
  maxRetriesPerRequest: null,
};

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

async function ensureQueueWorkerAvailable() {
  try {
    const workers = await getMessageQueue().getWorkers();
    if (workers.length === 0) {
      throw new QueueUnavailableError(
        "No active queue worker. Start the worker process (npm run dev:worker or npm run worker).",
      );
    }
  } catch (error) {
    if (error instanceof QueueUnavailableError) {
      throw error;
    }

    throw classifyQueueError(error);
  }
}

export async function enqueueTextJob(payload: Omit<SendTextJob, "type">) {
  const jobId = crypto.randomUUID();
  let job;

  try {
    await ensureQueueWorkerAvailable();
    job = await getMessageQueue().add(
      "send-text",
      {
        ...payload,
        type: "text",
      },
      {
        jobId,
      },
    );
  } catch (error) {
    throw classifyQueueError(error);
  }

  return { jobId: job.id?.toString() ?? jobId };
}

export async function enqueueMediaJob(payload: Omit<SendMediaJob, "type">) {
  const jobId = crypto.randomUUID();
  let job;

  try {
    await ensureQueueWorkerAvailable();
    job = await getMessageQueue().add(
      "send-media",
      {
        ...payload,
        type: "media",
      },
      {
        jobId,
      },
    );
  } catch (error) {
    throw classifyQueueError(error);
  }

  return { jobId: job.id?.toString() ?? jobId };
}
