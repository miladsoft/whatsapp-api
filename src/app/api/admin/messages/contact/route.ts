import { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/server/http/api";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().trim().min(1),
  chatId: z.string().trim().min(1),
  contactId: z.string().trim().min(1),
});

/**
 * POST /api/admin/messages/contact — send a contact card (admin, no API key)
 */
export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    const client = await sessionManager.ensureSession(input.sessionId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contact = await (client as any).getContactById(input.contactId);
    const sent = await client.sendMessage(input.chatId, contact);

    return ok({
      sent: true,
      messageId: sent.id?._serialized ?? String(sent.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send contact";
    return fail("BAD_REQUEST", message, 400);
  }
}
