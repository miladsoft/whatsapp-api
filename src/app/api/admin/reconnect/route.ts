import { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/server/http/api";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = schema.parse(await request.json());
    await sessionManager.reconnect(sessionId);
    return ok({ reconnecting: true, sessionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reconnect failed";
    return fail("BAD_REQUEST", message, 400);
  }
}
