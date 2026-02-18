import { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/server/http/api";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

const sendSchema = z.object({
  sessionId: z.string().trim().min(1),
  chatId: z.string().trim().min(1),
  text: z.string().trim().min(1).max(4096),
  quotedMessageId: z.string().optional(),
});

/**
 * POST /api/admin/messages/send — send a message directly (bypasses queue)
 */
export async function POST(request: NextRequest) {
  try {
    const input = sendSchema.parse(await request.json());
    const client = await sessionManager.ensureSession(input.sessionId);

    const options: Record<string, unknown> = {};
    if (input.quotedMessageId) {
      const quotedMsg = await client.getMessageById(input.quotedMessageId);
      options.quotedMessageId = quotedMsg.id._serialized;
    }

    const sent = await client.sendMessage(input.chatId, input.text, options);

    return ok({
      sent: true,
      messageId: sent.id?._serialized ?? String(sent.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send failed";
    return fail("BAD_REQUEST", message, 400);
  }
}
