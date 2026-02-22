import { NextRequest } from "next/server";

import { fail, ok } from "@/server/http/api";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

/**
 * GET /api/admin/chats/messages?sessionId=main&chatId=xxx&limit=50
 * Returns messages from a specific chat via the WhatsApp client.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId") || "main";
  const chatId = request.nextUrl.searchParams.get("chatId");
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "50", 10), 500);

  if (!chatId) {
    return fail("BAD_REQUEST", "chatId query param is required", 400);
  }

  try {
    const messages = await sessionManager.getChatMessages(sessionId, chatId, limit);
    return ok({ messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get messages";
    if (message.includes("The browser is already running for")) {
      return ok({ messages: [], warning: message });
    }
    return fail("BAD_REQUEST", message, 400);
  }
}
