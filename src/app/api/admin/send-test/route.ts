import { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/server/http/api";
import { enqueueTextJob, isQueueUnavailableError } from "@/server/queue/queue";
import { statusStore } from "@/server/store/statusStore";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().trim().min(1),
  to: z
    .string()
    .trim()
    .transform((value) => value.replace(/[^\d]/g, ""))
    .refine((digits) => /^\d{8,15}$/.test(digits), {
      message: "Invalid recipient number. Expected 8-15 digits.",
    }),
  text: z.string().trim().min(1).max(4096),
});

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    const { jobId } = await enqueueTextJob(input);

    statusStore.addJobLog({
      jobId,
      sessionId: input.sessionId,
      type: "text",
      status: "queued",
      message: `Queued test text to ${input.to}`,
    });

    return ok({ queued: true, jobId });
  } catch (error) {
    if (isQueueUnavailableError(error)) {
      return fail("UNAVAILABLE", error.message, 503);
    }

    const message = error instanceof Error ? error.message : "Send test failed";
    return fail("BAD_REQUEST", message, 400);
  }
}
