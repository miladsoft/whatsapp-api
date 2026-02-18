import { NextRequest } from "next/server";

import { requireApiKey } from "@/server/auth/apiKey";
import { fail, ok } from "@/server/http/api";
import { optionsResponse, withCors } from "@/server/http/cors";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const apiKeyError = requireApiKey(request);
  if (apiKeyError) return withCors(request, apiKeyError);

  const { id: contactId } = await context.params;
  const sessionId = request.nextUrl.searchParams.get("sessionId") || process.env.DEFAULT_SESSION_ID || "main";

  try {
    const contact = await sessionManager.getContactById(sessionId, contactId);
    const profilePic = await sessionManager.getProfilePicUrl(sessionId, contactId).catch(() => null);
    const about = await sessionManager.getContactAbout(sessionId, contactId).catch(() => null);

    return withCors(request, ok({ contact: { ...contact, profilePicUrl: profilePic, about } }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Contact not found";
    return withCors(request, fail("NOT_FOUND", message, 404));
  }
}
