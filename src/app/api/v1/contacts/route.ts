import { NextRequest } from "next/server";

import { requireApiKey } from "@/server/auth/apiKey";
import { fail, ok } from "@/server/http/api";
import { optionsResponse, withCors } from "@/server/http/cors";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(request: NextRequest) {
  const apiKeyError = requireApiKey(request);
  if (apiKeyError) return withCors(request, apiKeyError);

  const sessionId = request.nextUrl.searchParams.get("sessionId") || process.env.DEFAULT_SESSION_ID || "main";

  try {
    const contacts = await sessionManager.getContacts(sessionId);
    return withCors(request, ok({ contacts }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get contacts";
    return withCors(request, fail("BAD_REQUEST", message, 400));
  }
}
