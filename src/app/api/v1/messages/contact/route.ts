import { NextRequest } from "next/server";
import { z } from "zod";

import { requireApiKey } from "@/server/auth/apiKey";
import { fail, ok } from "@/server/http/api";
import { optionsResponse, withCors } from "@/server/http/cors";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1),
  contactId: z.string().trim().min(1),
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

    await sessionManager.sendContactCard(sessionId, input.to, input.contactId);
    return withCors(request, ok({ sent: true }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send contact failed";
    return withCors(request, fail("BAD_REQUEST", message, 400));
  }
}
