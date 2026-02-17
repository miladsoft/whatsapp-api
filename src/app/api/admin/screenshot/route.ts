import { NextRequest } from "next/server";

import { fail, ok } from "@/server/http/api";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("sessionId") || "main";
    const imageDataUrl = await sessionManager.captureSessionScreenshot(sessionId);

    return ok({
      sessionId,
      imageDataUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Screenshot failed";
    return fail("BAD_REQUEST", message, 400);
  }
}
