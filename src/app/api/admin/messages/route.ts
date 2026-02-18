import { NextRequest } from "next/server";

import { fail, ok } from "@/server/http/api";
import { eventStore } from "@/server/store/eventStore";

export const runtime = "nodejs";

/**
 * GET /api/admin/messages?chatId=xxx&limit=50
 * Returns recent messages, optionally filtered by chatId.
 */
export async function GET(request: NextRequest) {
  const chatId = request.nextUrl.searchParams.get("chatId");
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "50", 10), 500);

  if (chatId) {
    return ok({ messages: eventStore.getChatMessages(chatId, limit) });
  }

  return ok({ messages: eventStore.getRecentMessages(limit) });
}
