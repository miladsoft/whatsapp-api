import { NextRequest } from "next/server";

import { ok } from "@/server/http/api";
import { statusStore } from "@/server/store/statusStore";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  const defaultSessionId = process.env.DEFAULT_SESSION_ID || "main";
  try {
    await sessionManager.ensureSession(defaultSessionId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to initialize session";

    statusStore.upsertSession(defaultSessionId, {
      status: "disconnected",
      lastError: message,
    });
  }

  return ok({
    defaultSessionId,
    activeSessionId: statusStore.getActiveSession(),
    sessions: sessionManager.getAllSessionStates(),
    jobLogs: statusStore.getJobLogs(30),
  });
}
