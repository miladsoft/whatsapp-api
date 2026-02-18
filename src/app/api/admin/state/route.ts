import { NextRequest } from "next/server";

import { ok } from "@/server/http/api";
import { statusStore } from "@/server/store/statusStore";
import { sessionManager } from "@/server/whatsapp/manager";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  const defaultSessionId = process.env.DEFAULT_SESSION_ID || "main";

  // Non-blocking: start the default session and discover saved ones
  sessionManager.startSession(defaultSessionId);
  sessionManager.discoverSessions();

  return ok({
    defaultSessionId,
    activeSessionId: statusStore.getActiveSession(),
    sessions: sessionManager.getAllSessionStates(),
    jobLogs: statusStore.getJobLogs(30),
  });
}
