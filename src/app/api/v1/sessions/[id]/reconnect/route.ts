import { NextRequest } from "next/server";

import { requireApiKey } from "@/server/auth/apiKey";
import { fail, ok } from "@/server/http/api";
import { optionsResponse, withCors } from "@/server/http/cors";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const apiKeyError = requireApiKey(request);
  if (apiKeyError) {
    return withCors(request, apiKeyError);
  }

  try {
    const { id } = await context.params;
    await sessionManager.reconnect(id);
    return withCors(request, ok({ sessionId: id, reconnecting: true }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reconnect failed";
    return withCors(request, fail("INTERNAL_ERROR", message, 500));
  }
}
