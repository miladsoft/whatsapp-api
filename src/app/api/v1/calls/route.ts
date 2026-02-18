import { NextRequest } from "next/server";
import { z } from "zod";

import { requireApiKey } from "@/server/auth/apiKey";
import { fail, ok } from "@/server/http/api";
import { optionsResponse, withCors } from "@/server/http/cors";
import { eventStore } from "@/server/store/eventStore";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(request: NextRequest) {
  const apiKeyError = requireApiKey(request);
  if (apiKeyError) return withCors(request, apiKeyError);

  const sessionId = request.nextUrl.searchParams.get("sessionId") || process.env.DEFAULT_SESSION_ID || "main";
  const calls = eventStore.getCalls(sessionId);
  return withCors(request, ok({ calls }));
}

const rejectSchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  callId: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  const apiKeyError = requireApiKey(request);
  if (apiKeyError) return withCors(request, apiKeyError);

  try {
    const input = rejectSchema.parse(await request.json());
    const sessionId = input.sessionId || process.env.DEFAULT_SESSION_ID || "main";

    await sessionManager.rejectCall(sessionId, input.callId);
    return withCors(request, ok({ rejected: true }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reject call failed";
    return withCors(request, fail("BAD_REQUEST", message, 400));
  }
}
