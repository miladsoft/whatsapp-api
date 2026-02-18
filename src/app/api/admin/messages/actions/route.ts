import { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/server/http/api";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().trim().min(1),
  messageId: z.string().trim().min(1),
  action: z.enum([
    "reply",
    "forward",
    "delete",
    "star",
    "unstar",
    "react",
    "edit",
    "pin",
    "unpin",
    "downloadMedia",
  ]),
  content: z.string().optional(),
  chatId: z.string().optional(),
  reaction: z.string().optional(),
  everyone: z.boolean().optional(),
  duration: z.number().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    const { sessionId, messageId, action } = input;

    switch (action) {
      case "reply": {
        if (!input.content) return fail("BAD_REQUEST", "content is required for reply", 400);
        await sessionManager.replyToMessage(sessionId, messageId, input.content);
        return ok({ done: true, action });
      }
      case "forward": {
        if (!input.chatId) return fail("BAD_REQUEST", "chatId is required for forward", 400);
        await sessionManager.forwardMessage(sessionId, messageId, input.chatId);
        return ok({ done: true, action });
      }
      case "delete": {
        await sessionManager.deleteMessage(sessionId, messageId, input.everyone ?? false);
        return ok({ done: true, action });
      }
      case "star": {
        await sessionManager.starMessage(sessionId, messageId);
        return ok({ done: true, action });
      }
      case "unstar": {
        await sessionManager.unstarMessage(sessionId, messageId);
        return ok({ done: true, action });
      }
      case "react": {
        if (input.reaction === undefined) return fail("BAD_REQUEST", "reaction is required", 400);
        await sessionManager.reactToMessage(sessionId, messageId, input.reaction);
        return ok({ done: true, action });
      }
      case "edit": {
        if (!input.content) return fail("BAD_REQUEST", "content is required for edit", 400);
        await sessionManager.editMessage(sessionId, messageId, input.content);
        return ok({ done: true, action });
      }
      case "pin": {
        await sessionManager.pinMessage(sessionId, messageId, input.duration ?? 604800);
        return ok({ done: true, action });
      }
      case "unpin": {
        await sessionManager.unpinMessage(sessionId, messageId);
        return ok({ done: true, action });
      }
      case "downloadMedia": {
        const media = await sessionManager.downloadMedia(sessionId, messageId);
        return ok({ ...media, action });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Message action failed";
    return fail("BAD_REQUEST", message, 400);
  }
}
