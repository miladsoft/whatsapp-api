export type SessionStatus =
  | "connecting"
  | "qr"
  | "authenticated"
  | "ready"
  | "disconnected"
  | "auth_failure"
  | "unknown";

export interface SessionState {
  sessionId: string;
  status: SessionStatus;
  qr?: string;
  lastError?: string;
  reconnectAttempts: number;
  updatedAt: string;
}

export interface JobLog {
  jobId: string;
  sessionId: string;
  type: "text" | "media";
  status: "queued" | "success" | "failed";
  message?: string;
  createdAt: string;
}

class StatusStore {
  private readonly sessions = new Map<string, SessionState>();
  private readonly jobLogs: JobLog[] = [];
  private readonly maxJobLogs = 500;
  private activeSessionId: string = process.env.DEFAULT_SESSION_ID || "main";

  upsertSession(
    sessionId: string,
    patch: Partial<Omit<SessionState, "sessionId" | "updatedAt">>,
  ) {
    const previous = this.sessions.get(sessionId);
    const nextState: SessionState = {
      sessionId,
      status: patch.status ?? previous?.status ?? "unknown",
      qr: patch.qr ?? previous?.qr,
      lastError: patch.lastError ?? previous?.lastError,
      reconnectAttempts:
        patch.reconnectAttempts ?? previous?.reconnectAttempts ?? 0,
      updatedAt: new Date().toISOString(),
    };

    if (patch.status === "ready" || patch.status === "authenticated") {
      nextState.qr = undefined;
      nextState.lastError = undefined;
    }

    this.sessions.set(sessionId, nextState);
    return nextState;
  }

  getSession(sessionId: string) {
    return this.sessions.get(sessionId) ?? null;
  }

  getSessions() {
    return Array.from(this.sessions.values()).sort((a, b) =>
      a.sessionId.localeCompare(b.sessionId),
    );
  }

  setActiveSession(sessionId: string) {
    this.activeSessionId = sessionId;
    if (!this.sessions.has(sessionId)) {
      this.upsertSession(sessionId, {
        status: "unknown",
        reconnectAttempts: 0,
      });
    }
    return this.activeSessionId;
  }

  getActiveSession() {
    return this.activeSessionId;
  }

  addJobLog(log: Omit<JobLog, "createdAt">) {
    this.jobLogs.unshift({
      ...log,
      createdAt: new Date().toISOString(),
    });

    if (this.jobLogs.length > this.maxJobLogs) {
      this.jobLogs.length = this.maxJobLogs;
    }
  }

  getJobLogs(limit = 50) {
    return this.jobLogs.slice(0, limit);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __statusStore__: StatusStore | undefined;
}

export const statusStore = globalThis.__statusStore__ ?? new StatusStore();

if (!globalThis.__statusStore__) {
  globalThis.__statusStore__ = statusStore;
}
