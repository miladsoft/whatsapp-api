import { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/server/http/api";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().trim().min(1),
  contactId: z.string().trim().min(1),
  action: z.enum(["block", "unblock"]),
});

export async function POST(request: NextRequest) {
  try {
    const { sessionId, contactId, action } = schema.parse(await request.json());

    if (action === "block") {
      await sessionManager.blockContact(sessionId, contactId);
    } else {
      await sessionManager.unblockContact(sessionId, contactId);
    }

    return ok({ done: true, action, contactId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Contact action failed";
    return fail("BAD_REQUEST", message, 400);
  }
}
