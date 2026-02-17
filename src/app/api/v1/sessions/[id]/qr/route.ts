import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

import { requireApiKey } from "@/server/auth/apiKey";
import { fail } from "@/server/http/api";
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

  const qr = sessionManager.getQrString(id);
  if (!qr) {
    return withCors(
      request,
      fail("NOT_FOUND", "QR not available. Session may already be authenticated.", 404),
    );
  }

  const pngBuffer = await QRCode.toBuffer(qr, { type: "png", margin: 1, width: 320 });

  const response = new NextResponse(new Uint8Array(pngBuffer), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });

  return withCors(request, response);
}
