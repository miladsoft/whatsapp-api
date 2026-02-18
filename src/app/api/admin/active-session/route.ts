import { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/server/http/api";
import { statusStore } from "@/server/store/statusStore";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = schema.parse(await request.json());

    sessionManager.startSession(sessionId);
    statusStore.setActiveSession(sessionId);

    return ok({
      activeSessionId: statusStore.getActiveSession(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to set active session";
    return fail("BAD_REQUEST", message, 400);
  }
}
