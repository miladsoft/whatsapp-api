import { NextRequest } from "next/server";

import { ok } from "@/server/http/api";
import { eventStore } from "@/server/store/eventStore";
import type { WaEvent } from "@/server/store/eventStore";

export const runtime = "nodejs";

/**
 * SSE endpoint — streams real-time WhatsApp events to the client.
 * GET /api/admin/events?sessionId=main
 */
export async function GET(request: NextRequest) {
  const sessionFilter = request.nextUrl.searchParams.get("sessionId") || null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(event: WaEvent) {
        try {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${data}\n\n`));
        } catch {
          // stream closed
        }
      }

      // Send a keep-alive comment every 15s
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          clearInterval(keepAlive);
        }
      }, 15_000);

      const unsubscribe = eventStore.bus.subscribe((event) => {
        if (sessionFilter && event.sessionId !== sessionFilter) return;
        send(event);
      });

      // Clean up on client disconnect
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(keepAlive);
        try {
          controller.close();
        } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
