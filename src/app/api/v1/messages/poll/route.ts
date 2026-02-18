import { NextRequest } from "next/server";
import { z } from "zod";

import { requireApiKey } from "@/server/auth/apiKey";
import { fail, ok } from "@/server/http/api";
import { optionsResponse, withCors } from "@/server/http/cors";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  to: z
    .string()
    .trim()
    .transform((v) => v.replace(/[^\d]/g, ""))
    .refine((d) => /^\d{8,15}$/.test(d), { message: "Invalid number" }),
  pollName: z.string().trim().min(1),
  options: z.array(z.string().trim().min(1)).min(2),
  allowMultiple: z.boolean().optional(),
});

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  const apiKeyError = requireApiKey(request);
  if (apiKeyError) return withCors(request, apiKeyError);

  try {
    const input = schema.parse(await request.json());
    const sessionId = input.sessionId || process.env.DEFAULT_SESSION_ID || "main";
    const sent = await sessionManager.sendPoll(sessionId, input.to, input.pollName, input.options, input.allowMultiple);

    return withCors(request, ok({
      sent: true,
      messageId: sent.id?._serialized ?? String(sent.id),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send poll";
    return withCors(request, fail("BAD_REQUEST", message, 400));
  }
}
