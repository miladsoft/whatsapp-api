import { NextRequest } from "next/server";
import QRCode from "qrcode";

import { fail, ok } from "@/server/http/api";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId") || "main";

  // Start session without blocking — QR arrives via event
  sessionManager.startSession(sessionId);

  const qr = sessionManager.getQrString(sessionId);
  if (!qr) {
    const state = sessionManager.getSessionState(sessionId);
    if (state.status === "ready" || state.status === "authenticated") {
      return ok({ sessionId, qrDataUrl: null });
    }
    return fail("NOT_FOUND", "QR not available yet", 404);
  }

  const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });

  return ok({
    sessionId,
    qrDataUrl: dataUrl,
  });
}
