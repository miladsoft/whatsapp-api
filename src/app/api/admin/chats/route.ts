import { NextRequest } from "next/server";

import { fail, ok } from "@/server/http/api";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

/**
 * GET /api/admin/chats?sessionId=main
 * Returns all chats for the session.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId") || "main";

  try {
    const chats = await sessionManager.getChats(sessionId);
    return ok({ chats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get chats";
    if (message.includes("The browser is already running for")) {
      return ok({ chats: [], warning: message });
    }
    return fail("BAD_REQUEST", message, 400);
  }
}
