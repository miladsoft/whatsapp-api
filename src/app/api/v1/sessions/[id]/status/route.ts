import { NextRequest } from "next/server";

import { requireApiKey } from "@/server/auth/apiKey";
import { ok } from "@/server/http/api";
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
  if (apiKeyError) {
    return withCors(request, apiKeyError);
  }

  const { id } = await context.params;
  await sessionManager.ensureSession(id);

  return withCors(
    request,
    ok({
      session: sessionManager.getSessionState(id),
    }),
  );
}
