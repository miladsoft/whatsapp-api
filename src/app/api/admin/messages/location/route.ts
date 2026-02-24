import { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/server/http/api";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().trim().min(1),
  chatId: z.string().trim().min(1),
  latitude: z.number(),
  longitude: z.number(),
  description: z.string().optional(),
});

/**
 * POST /api/admin/messages/location — send a location message (admin, no API key)
 */
export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    const client = await sessionManager.ensureSession(input.sessionId);

    // Import Location from whatsapp-web.js
    const { Location } = await import("whatsapp-web.js");
    const location = new Location(
      input.latitude,
      input.longitude,
      input.description ? { name: input.description } : undefined,
    );

    const sent = await client.sendMessage(input.chatId, location);

    return ok({
      sent: true,
      messageId: sent.id?._serialized ?? String(sent.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send location";
    return fail("BAD_REQUEST", message, 400);
  }
}
