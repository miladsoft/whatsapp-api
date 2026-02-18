import { NextRequest } from "next/server";
import { z } from "zod";

import { requireApiKey } from "@/server/auth/apiKey";
import { fail, ok } from "@/server/http/api";
import { optionsResponse, withCors } from "@/server/http/cors";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

const createSchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  participants: z.array(z.string().trim().min(1)),
});

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

/** POST /api/v1/groups — create a new group */
export async function POST(request: NextRequest) {
  const apiKeyError = requireApiKey(request);
  if (apiKeyError) return withCors(request, apiKeyError);

  try {
    const input = createSchema.parse(await request.json());
    const sessionId = input.sessionId || process.env.DEFAULT_SESSION_ID || "main";
    const result = await sessionManager.createGroup(sessionId, input.title, input.participants);
    return withCors(request, ok({ group: result }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create group";
    return withCors(request, fail("BAD_REQUEST", message, 400));
  }
}
