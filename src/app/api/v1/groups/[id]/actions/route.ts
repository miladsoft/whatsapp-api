import { NextRequest } from "next/server";
import { z } from "zod";

import { requireApiKey } from "@/server/auth/apiKey";
import { fail, ok } from "@/server/http/api";
import { optionsResponse, withCors } from "@/server/http/cors";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  action: z.enum([
    "addParticipants",
    "removeParticipants",
    "promoteParticipants",
    "demoteParticipants",
    "setSubject",
    "setDescription",
    "getInviteCode",
    "revokeInvite",
    "leave",
  ]),
  participants: z.array(z.string()).optional(),
  subject: z.string().optional(),
  description: z.string().optional(),
});

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const apiKeyError = requireApiKey(request);
  if (apiKeyError) return withCors(request, apiKeyError);

  const { id: chatId } = await context.params;

  try {
    const input = schema.parse(await request.json());
    const sessionId = input.sessionId || process.env.DEFAULT_SESSION_ID || "main";
    const { action } = input;

    switch (action) {
      case "addParticipants":
        if (!input.participants?.length) return withCors(request, fail("BAD_REQUEST", "participants required", 400));
        await sessionManager.addGroupParticipants(sessionId, chatId, input.participants);
        break;
      case "removeParticipants":
        if (!input.participants?.length) return withCors(request, fail("BAD_REQUEST", "participants required", 400));
        await sessionManager.removeGroupParticipants(sessionId, chatId, input.participants);
        break;
      case "promoteParticipants":
        if (!input.participants?.length) return withCors(request, fail("BAD_REQUEST", "participants required", 400));
        await sessionManager.promoteGroupParticipants(sessionId, chatId, input.participants);
        break;
      case "demoteParticipants":
        if (!input.participants?.length) return withCors(request, fail("BAD_REQUEST", "participants required", 400));
        await sessionManager.demoteGroupParticipants(sessionId, chatId, input.participants);
        break;
      case "setSubject":
        if (!input.subject) return withCors(request, fail("BAD_REQUEST", "subject required", 400));
        await sessionManager.setGroupSubject(sessionId, chatId, input.subject);
        break;
      case "setDescription":
        await sessionManager.setGroupDescription(sessionId, chatId, input.description ?? "");
        break;
      case "getInviteCode": {
        const code = await sessionManager.getGroupInviteCode(sessionId, chatId);
        return withCors(request, ok({ inviteCode: code }));
      }
      case "revokeInvite":
        await sessionManager.revokeGroupInvite(sessionId, chatId);
        break;
      case "leave":
        await sessionManager.leaveGroup(sessionId, chatId);
        break;
    }

    return withCors(request, ok({ done: true, action, chatId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Group action failed";
    return withCors(request, fail("BAD_REQUEST", message, 400));
  }
}
