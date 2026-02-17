import "dotenv/config";

import { Worker } from "bullmq";

import {
  queueName,
  redisConnection,
  type SendJob,
  type SendJobName,
} from "@/server/queue/queue";

const MIN_SESSION_DELAY_MS = 1_500;
const sessionLocks = new Map<string, Promise<void>>();
const sessionLastSendAt = new Map<string, number>();

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runInSessionLock<T>(sessionId: string, task: () => Promise<T>) {
  const previous = sessionLocks.get(sessionId) ?? Promise.resolve();

  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  sessionLocks.set(sessionId, previous.then(() => current));

  await previous;

  try {
    const lastSentAt = sessionLastSendAt.get(sessionId) ?? 0;
    const elapsed = Date.now() - lastSentAt;
    const wait = Math.max(0, MIN_SESSION_DELAY_MS - elapsed);
    if (wait > 0) {
      await delay(wait);
    }

    const result = await task();
    sessionLastSendAt.set(sessionId, Date.now());
    return result;
  } finally {
    release();
  }
}

async function callInternalSendApi(payload: SendJob) {
  const workerToken =
    process.env.WORKER_TOKEN ||
    process.env.API_KEY ||
    (process.env.NODE_ENV !== "production" ? "dev-worker-token" : undefined);
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";

  if (!workerToken) {
    throw new Error("WORKER_TOKEN or API_KEY must be configured");
  }

  const response = await fetch(`${baseUrl}/api/internal/jobs/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-token": workerToken,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Internal send API failed (${response.status}): ${body}`);
  }
}

const worker = new Worker(
  queueName,
  async (job) => {
    await runInSessionLock(job.data.sessionId, async () => {
      await callInternalSendApi(job.data);
    });

    return {
      ok: true,
      jobId: job.id,
      sessionId: job.data.sessionId,
    };
  },
  {
    connection: redisConnection,
    concurrency: 20,
  },
) as Worker<SendJob, { ok: boolean; jobId: string | undefined; sessionId: string }, SendJobName>;

worker.on("completed", (job) => {
  console.info(
    `[worker] completed job=${job.id?.toString()} session=${job.data.sessionId}`,
  );
});

worker.on("failed", (job, error) => {
  console.error(
    `[worker] failed job=${job?.id?.toString()} session=${job?.data.sessionId}: ${error.message}`,
  );
});

async function shutdown() {
  await worker.close();
}

process.on("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});

console.info("[worker] started");
