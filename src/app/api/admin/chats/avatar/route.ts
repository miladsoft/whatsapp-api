import { NextRequest } from "next/server";

import { fail, ok } from "@/server/http/api";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

/**
 * GET /api/admin/chats/avatar?sessionId=main&chatId=12345@c.us
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId") || "main";
  const chatId = request.nextUrl.searchParams.get("chatId") || "";

  if (!chatId) {
    return fail("BAD_REQUEST", "chatId is required", 400);
  }

  try {
    const client = await sessionManager.ensureSession(sessionId);
    const profilePicUrl = await client.getProfilePicUrl(chatId).catch(() => null);
    return ok({ chatId, profilePicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get avatar";
    return fail("BAD_REQUEST", message, 400);
  }
}
