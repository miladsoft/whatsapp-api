import { NextRequest } from "next/server";

import { fail, ok } from "@/server/http/api";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

/**
 * GET /api/admin/contacts?sessionId=main
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId") || "main";

  try {
    const contacts = await sessionManager.getContacts(sessionId);
    return ok({ contacts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get contacts";
    return fail("BAD_REQUEST", message, 400);
  }
}
