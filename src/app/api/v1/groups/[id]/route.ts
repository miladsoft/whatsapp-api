import { NextRequest } from "next/server";

import { requireApiKey } from "@/server/auth/apiKey";
import { fail, ok } from "@/server/http/api";
import { optionsResponse, withCors } from "@/server/http/cors";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

/** GET /api/v1/groups/[id] — get group info */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const apiKeyError = requireApiKey(request);
  if (apiKeyError) return withCors(request, apiKeyError);

  const { id: chatId } = await context.params;
  const sessionId = request.nextUrl.searchParams.get("sessionId") || process.env.DEFAULT_SESSION_ID || "main";

  try {
    const group = await sessionManager.getGroupChat(sessionId, chatId);
    return withCors(request, ok({ group }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Group not found";
    return withCors(request, fail("NOT_FOUND", message, 404));
  }
}
