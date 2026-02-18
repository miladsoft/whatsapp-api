import { NextRequest } from "next/server";

import { requireApiKey } from "@/server/auth/apiKey";
import { fail, ok } from "@/server/http/api";
import { optionsResponse, withCors } from "@/server/http/cors";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const apiKeyError = requireApiKey(request);
  if (apiKeyError) return withCors(request, apiKeyError);

  const { id: chatId } = await context.params;
  const sessionId = request.nextUrl.searchParams.get("sessionId") || process.env.DEFAULT_SESSION_ID || "main";
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "50", 10), 500);

  try {
    const messages = await sessionManager.getChatMessages(sessionId, chatId, limit);
    return withCors(request, ok({ messages }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get messages";
    return withCors(request, fail("BAD_REQUEST", message, 400));
  }
}
