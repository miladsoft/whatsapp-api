import { NextRequest } from "next/server";
import { z } from "zod";

import { requireApiKey } from "@/server/auth/apiKey";
import { fail, ok } from "@/server/http/api";
import { optionsResponse, withCors } from "@/server/http/cors";
import { enqueueTextJob, isQueueUnavailableError } from "@/server/queue/queue";
import { statusStore } from "@/server/store/statusStore";

export const runtime = "nodejs";

const textMessageSchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  to: z
    .string()
    .trim()
    .transform((value) => value.replace(/[^\d]/g, ""))
    .refine((digits) => /^\d{8,15}$/.test(digits), {
      message: "Invalid recipient number. Expected 8-15 digits.",
    }),
  text: z.string().trim().min(1).max(4096),
});

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  const apiKeyError = requireApiKey(request);
  if (apiKeyError) {
    return withCors(request, apiKeyError);
  }

  try {
    const input = textMessageSchema.parse(await request.json());
    const sessionId =
      input.sessionId || statusStore.getActiveSession() || process.env.DEFAULT_SESSION_ID || "main";
    const { jobId } = await enqueueTextJob({
      ...input,
      sessionId,
    });

    statusStore.addJobLog({
      jobId,
      sessionId,
      type: "text",
      status: "queued",
      message: `Queued text to ${input.to}`,
    });

    return withCors(
      request,
      ok({
        jobId,
        queued: true,
      }),
    );
  } catch (error) {
    if (isQueueUnavailableError(error)) {
      return withCors(request, fail("UNAVAILABLE", error.message, 503));
    }

    const message = error instanceof Error ? error.message : "Invalid payload";
    return withCors(request, fail("BAD_REQUEST", message, 400));
  }
}
