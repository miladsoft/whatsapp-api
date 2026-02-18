import { NextRequest } from "next/server";
import { z } from "zod";

import { requireApiKey } from "@/server/auth/apiKey";
import { fail, ok } from "@/server/http/api";
import { optionsResponse, withCors } from "@/server/http/cors";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  messageId: z.string().trim().min(1),
  action: z.enum(["reply", "forward", "delete", "star", "unstar", "react", "edit", "pin", "unpin", "downloadMedia"]),
  content: z.string().optional(),
  chatId: z.string().optional(),
  reaction: z.string().optional(),
  everyone: z.boolean().optional(),
  duration: z.number().optional(),
});

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  const apiKeyError = requireApiKey(request);
  if (apiKeyError) return withCors(request, apiKeyError);

  try {
    const input = schema.parse(await request.json());
    const sessionId = input.sessionId || process.env.DEFAULT_SESSION_ID || "main";
    const { messageId, action } = input;

    switch (action) {
      case "reply":
        if (!input.content) return withCors(request, fail("BAD_REQUEST", "content required", 400));
        await sessionManager.replyToMessage(sessionId, messageId, input.content);
        return withCors(request, ok({ done: true, action }));
      case "forward":
        if (!input.chatId) return withCors(request, fail("BAD_REQUEST", "chatId required", 400));
        await sessionManager.forwardMessage(sessionId, messageId, input.chatId);
        return withCors(request, ok({ done: true, action }));
      case "delete":
        await sessionManager.deleteMessage(sessionId, messageId, input.everyone ?? false);
        return withCors(request, ok({ done: true, action }));
      case "star":
        await sessionManager.starMessage(sessionId, messageId);
        return withCors(request, ok({ done: true, action }));
      case "unstar":
        await sessionManager.unstarMessage(sessionId, messageId);
        return withCors(request, ok({ done: true, action }));
      case "react":
        if (input.reaction === undefined) return withCors(request, fail("BAD_REQUEST", "reaction required", 400));
        await sessionManager.reactToMessage(sessionId, messageId, input.reaction);
        return withCors(request, ok({ done: true, action }));
      case "edit":
        if (!input.content) return withCors(request, fail("BAD_REQUEST", "content required", 400));
        await sessionManager.editMessage(sessionId, messageId, input.content);
        return withCors(request, ok({ done: true, action }));
      case "pin":
        await sessionManager.pinMessage(sessionId, messageId, input.duration ?? 604800);
        return withCors(request, ok({ done: true, action }));
      case "unpin":
        await sessionManager.unpinMessage(sessionId, messageId);
        return withCors(request, ok({ done: true, action }));
      case "downloadMedia": {
        const media = await sessionManager.downloadMedia(sessionId, messageId);
        return withCors(request, ok({ ...media, action }));
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Message action failed";
    return withCors(request, fail("BAD_REQUEST", message, 400));
  }
}
