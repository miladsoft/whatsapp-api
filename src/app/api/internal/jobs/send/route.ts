import { NextRequest } from "next/server";
import { z } from "zod";

import { requireWorkerToken } from "@/server/auth/apiKey";
import { fail, ok } from "@/server/http/api";
import { statusStore } from "@/server/store/statusStore";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

const sendTextSchema = z.object({
  type: z.literal("text"),
  sessionId: z.string().trim().min(1),
  to: z
    .string()
    .trim()
    .transform((value) => value.replace(/[^\d]/g, ""))
    .refine((digits) => /^\d{8,15}$/.test(digits), {
      message: "Invalid recipient number. Expected 8-15 digits.",
    }),
  text: z.string().trim().min(1),
});

const sendMediaSchema = z.object({
  type: z.literal("media"),
  sessionId: z.string().trim().min(1),
  to: z
    .string()
    .trim()
    .transform((value) => value.replace(/[^\d]/g, ""))
    .refine((digits) => /^\d{8,15}$/.test(digits), {
      message: "Invalid recipient number. Expected 8-15 digits.",
    }),
  caption: z.string().trim().max(1024).optional(),
  mediaUrl: z.url(),
  filename: z.string().trim().max(255).optional(),
});

const sendJobSchema = z.discriminatedUnion("type", [sendTextSchema, sendMediaSchema]);

export async function POST(request: NextRequest) {
  const workerTokenError = requireWorkerToken(request);
  if (workerTokenError) {
    return workerTokenError;
  }

  try {
    const payload = sendJobSchema.parse(await request.json());

    if (payload.type === "text") {
      const sent = await sessionManager.sendText(payload.sessionId, payload.to, payload.text);
      statusStore.addJobLog({
        jobId: sent.id._serialized,
        sessionId: payload.sessionId,
        type: "text",
        status: "success",
        message: `Sent text to ${payload.to}`,
      });

      return ok({
        sent: true,
        messageId: sent.id._serialized,
      });
    }

    const sent = await sessionManager.sendMedia(payload);
    statusStore.addJobLog({
      jobId: sent.id._serialized,
      sessionId: payload.sessionId,
      type: "media",
      status: "success",
      message: `Sent media to ${payload.to}`,
    });

    return ok({
      sent: true,
      messageId: sent.id._serialized,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker send failed";
    return fail("BAD_REQUEST", message, 400);
  }
}
