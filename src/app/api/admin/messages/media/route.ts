import { NextRequest } from "next/server";
import { MessageMedia } from "whatsapp-web.js";
import { z } from "zod";

import { fail, ok } from "@/server/http/api";
import { statusStore } from "@/server/store/statusStore";
import { sessionManager } from "@/server/whatsapp/manager";
import { toWhatsAppChatId } from "@/server/whatsapp/phone";

export const runtime = "nodejs";

const getQuerySchema = z.object({
  sessionId: z.string().trim().min(1),
  messageId: z.string().trim().min(1),
});

const fieldsSchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  chatId: z.string().trim().min(1),
  caption: z.string().trim().max(4096).optional(),
});

/**
 * GET /api/admin/messages/media?sessionId=main&messageId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const parsed = getQuerySchema.parse({
      sessionId: request.nextUrl.searchParams.get("sessionId") || "main",
      messageId: request.nextUrl.searchParams.get("messageId") || "",
    });

    const client = await sessionManager.ensureSession(parsed.sessionId);
    const message = await client.getMessageById(parsed.messageId);
    const media = await message.downloadMedia();

    if (!media?.data || !media?.mimetype) {
      return fail("NOT_FOUND", "Media not available for this message", 404);
    }

    return ok({
      messageId: parsed.messageId,
      mimetype: media.mimetype,
      filename: media.filename || null,
      dataUrl: `data:${media.mimetype};base64,${media.data}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load media";
    return fail("BAD_REQUEST", message, 400);
  }
}

/**
 * POST /api/admin/messages/media
 * multipart/form-data:
 *  - sessionId
 *  - chatId
 *  - caption (optional)
 *  - file
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const sessionId = String(formData.get("sessionId") || "").trim() || undefined;
    const chatId = String(formData.get("chatId") || formData.get("to") || "");
    const caption = String(formData.get("caption") || "").trim() || undefined;

    const parsed = fieldsSchema.parse({ sessionId, chatId, caption });
    const resolvedSessionId =
      parsed.sessionId || statusStore.getActiveSession() || process.env.DEFAULT_SESSION_ID || "main";

    const file = formData.get("file");
    if (!(file instanceof Blob)) {
      return fail("BAD_REQUEST", "file is required", 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const maybeFile = file as File;
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "application/octet-stream";
    const filename = typeof maybeFile.name === "string" && maybeFile.name ? maybeFile.name : "file";
    const media = new MessageMedia(mimeType, base64, filename);

    const normalizedChatId = /^\d{8,15}$/.test(parsed.chatId)
      ? toWhatsAppChatId(parsed.chatId)
      : parsed.chatId;

    const client = await sessionManager.ensureSession(resolvedSessionId);
    const sent = await client.sendMessage(normalizedChatId, media, {
      caption: parsed.caption,
    });

    return ok({
      sent: true,
      messageId: sent.id?._serialized ?? String(sent.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send media";
    return fail("BAD_REQUEST", message, 400);
  }
}
