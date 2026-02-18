import { NextRequest } from "next/server";
import { z } from "zod";

import { requireApiKey } from "@/server/auth/apiKey";
import { fail, ok } from "@/server/http/api";
import { optionsResponse, withCors } from "@/server/http/cors";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  messageId: z.string().trim().min(1),
  reaction: z.string().min(0),
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

    await sessionManager.reactToMessage(sessionId, input.messageId, input.reaction);
    return withCors(request, ok({ done: true }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "React failed";
    return withCors(request, fail("BAD_REQUEST", message, 400));
  }
}
