import { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/server/http/api";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().trim().min(1),
  chatId: z.string().trim().min(1),
  action: z.enum([
    "sendSeen",
    "archive",
    "unarchive",
    "mute",
    "unmute",
    "pin",
    "unpin",
    "delete",
    "clearMessages",
    "sendTyping",
    "sendRecording",
    "clearState",
  ]),
  unmuteDate: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    const { sessionId, chatId, action } = input;

    switch (action) {
      case "sendSeen":
        await sessionManager.sendSeen(sessionId, chatId);
        break;
      case "archive":
        await sessionManager.archiveChat(sessionId, chatId);
        break;
      case "unarchive":
        await sessionManager.unarchiveChat(sessionId, chatId);
        break;
      case "mute":
        await sessionManager.muteChat(sessionId, chatId, input.unmuteDate ? new Date(input.unmuteDate) : undefined);
        break;
      case "unmute":
        await sessionManager.unmuteChat(sessionId, chatId);
        break;
      case "pin":
        await sessionManager.pinChat(sessionId, chatId);
        break;
      case "unpin":
        await sessionManager.unpinChat(sessionId, chatId);
        break;
      case "delete":
        await sessionManager.deleteChat(sessionId, chatId);
        break;
      case "clearMessages":
        await sessionManager.clearChatMessages(sessionId, chatId);
        break;
      case "sendTyping":
        await sessionManager.sendTyping(sessionId, chatId);
        break;
      case "sendRecording":
        await sessionManager.sendRecording(sessionId, chatId);
        break;
      case "clearState":
        await sessionManager.clearChatState(sessionId, chatId);
        break;
    }

    return ok({ done: true, action, chatId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat action failed";
    return fail("BAD_REQUEST", message, 400);
  }
}
