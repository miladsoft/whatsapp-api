import { NextRequest } from "next/server";

import { requireApiKey } from "@/server/auth/apiKey";
import { ok } from "@/server/http/api";
import { optionsResponse, withCors } from "@/server/http/cors";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(request: NextRequest) {
  const apiKeyError = requireApiKey(request);
  if (apiKeyError) {
    return withCors(request, apiKeyError);
  }

  const defaultSessionId = process.env.DEFAULT_SESSION_ID || "main";
  await sessionManager.ensureSession(defaultSessionId);

  return withCors(
    request,
    ok({
      sessions: sessionManager.getAllSessionStates(),
      defaultSessionId,
    }),
  );
}
