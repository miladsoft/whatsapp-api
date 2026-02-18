"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ChatPanel } from "@/app/(admin)/admin/components/ChatPanel";
import { QrViewer } from "@/app/(admin)/admin/components/QrViewer";
import { SendTestForm } from "@/app/(admin)/admin/components/SendTestForm";
import { StatusBadge } from "@/app/(admin)/admin/components/StatusBadge";
import type { JobLog, SessionState } from "@/server/store/statusStore";

type DashboardState = {
  defaultSessionId: string;
  activeSessionId: string;
  sessions: SessionState[];
  jobLogs: JobLog[];
};

type ApiFailure = {
  ok: false;
  error?: {
    message?: string;
  };
};

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type ApiPayload<T> = ApiSuccess<T> | ApiFailure;

function getApiErrorMessage<T>(payload: ApiPayload<T> | null, fallback: string) {
  if (payload && payload.ok === false && payload.error?.message) {
    return payload.error.message;
  }

  return fallback;
}

async function readJsonSafely<T>(response: Response): Promise<ApiPayload<T> | null> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  try {
    return (await response.json()) as ApiPayload<T>;
  } catch {
    return null;
  }
}

export function AdminDashboard() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("main");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [capturingScreenshot, setCapturingScreenshot] = useState(false);
  const [newSessionId, setNewSessionId] = useState("");
  const [savingSession, setSavingSession] = useState(false);

  const selectedSession = useMemo(
    () => state?.sessions.find((session) => session.sessionId === selectedSessionId),
    [state, selectedSessionId],
  );

  const loadState = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/state", { cache: "no-store" });
      const payload = await readJsonSafely<DashboardState>(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to fetch dashboard state"));
      }

      const nextState = payload.data;
      setState(nextState);
      setSelectedSessionId((current) => {
        if (!current) {
          return nextState.activeSessionId || nextState.defaultSessionId;
        }

        const keepCurrent = nextState.sessions.some(
          (session) => session.sessionId === current,
        );
        return keepCurrent
          ? current
          : nextState.activeSessionId || nextState.defaultSessionId;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load state");
    }
  }, []);

  const loadQr = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`/api/admin/qr?sessionId=${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
      });
      const payload = await readJsonSafely<{ qrDataUrl: string | null }>(response);
      if (!response.ok || !payload?.ok) {
        setQrDataUrl(null);
        return;
      }

      setQrDataUrl(payload.data.qrDataUrl);
    } catch {
      setQrDataUrl(null);
    }
  }, []);

  const triggerSessionAction = useCallback(
    async (path: "reconnect" | "logout") => {
      await fetch(`/api/admin/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId: selectedSessionId }),
      });

      await loadState();
      await loadQr(selectedSessionId);
    },
    [selectedSessionId, loadState, loadQr],
  );

  const takeScreenshot = useCallback(async () => {
    setCapturingScreenshot(true);

    try {
      const response = await fetch(
        `/api/admin/screenshot?sessionId=${encodeURIComponent(selectedSessionId)}`,
        { cache: "no-store" },
      );
      const payload = await readJsonSafely<{ imageDataUrl: string }>(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to capture screenshot"));
      }

      setScreenshotDataUrl(payload.data.imageDataUrl);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to capture screenshot");
    } finally {
      setCapturingScreenshot(false);
    }
  }, [selectedSessionId]);

  const createSession = useCallback(async () => {
    const sessionId = newSessionId.trim();
    if (!sessionId) {
      setError("Session ID is required");
      return;
    }

    setSavingSession(true);
    try {
      const response = await fetch("/api/admin/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      });
      const payload = await readJsonSafely<{ created: boolean }>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to create session"));
      }

      setSelectedSessionId(sessionId);
      setNewSessionId("");
      await loadState();
      await loadQr(sessionId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setSavingSession(false);
    }
  }, [newSessionId, loadQr, loadState]);

  const setActiveSession = useCallback(async () => {
    setSavingSession(true);
    try {
      const response = await fetch("/api/admin/active-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId: selectedSessionId }),
      });
      const payload = await readJsonSafely<{ activeSessionId: string }>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to set active session"));
      }

      await loadState();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set active session");
    } finally {
      setSavingSession(false);
    }
  }, [selectedSessionId, loadState]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  useEffect(() => {
    if (!state) {
      return;
    }

    loadQr(selectedSessionId);
  }, [state, selectedSessionId, loadQr]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadState();
      loadQr(selectedSessionId);
    }, 5000);

    return () => clearInterval(timer);
  }, [selectedSessionId, loadState, loadQr]);

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6 lg:px-10">
      <header className="rounded-xl border border-zinc-800/80 bg-zinc-900/80 p-5">
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp Admin</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Monitor session health, manage reconnects, and send test messages.
        </p>
      </header>

      {error ? (
        <p className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 rounded-xl border border-zinc-800/80 bg-zinc-900/80 p-5 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium">Sessions</h2>
            <div className="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-1.5">
              <select
                className="rounded-md border border-zinc-700/60 bg-zinc-900/90 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                value={selectedSessionId}
                onChange={(event) => setSelectedSessionId(event.target.value)}
              >
                {(state?.sessions.length ? state.sessions : [{ sessionId: "main", status: "unknown" as const, reconnectAttempts: 0, updatedAt: new Date().toISOString() }]).map(
                  (session) => (
                    <option key={session.sessionId} value={session.sessionId}>
                      {session.sessionId}
                    </option>
                  ),
                )}
              </select>
              <button
                onClick={setActiveSession}
                disabled={savingSession || !selectedSessionId}
                className="rounded-md border border-zinc-700/60 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-zinc-700/80 disabled:opacity-60"
              >
                Set Active
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={newSessionId}
              onChange={(event) => setNewSessionId(event.target.value)}
              placeholder="new-session-id"
              className="w-full rounded-md border border-zinc-700/60 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-500"
            />
            <button
              onClick={createSession}
              disabled={savingSession}
              className="min-w-28 whitespace-nowrap rounded-md border border-zinc-700/60 bg-zinc-800/80 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700/80 disabled:opacity-60"
            >
              Add Session
            </button>
          </div>

          <div className="grid gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3 text-sm sm:grid-cols-2">
            <p>
              <span className="text-zinc-400">Active session:</span>{" "}
              {state?.activeSessionId ?? state?.defaultSessionId ?? "main"}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-zinc-400">Status:</span>
              <StatusBadge status={selectedSession?.status ?? "unknown"} />
            </div>
            <p>
              <span className="text-zinc-400">Reconnect attempts:</span>{" "}
              {selectedSession?.reconnectAttempts ?? 0}
            </p>
            <p>
              <span className="text-zinc-400">Last update:</span>{" "}
              {selectedSession?.updatedAt ?? "-"}
            </p>
            {selectedSession?.lastError ? (
              <p className="sm:col-span-2 text-red-300">Error: {selectedSession.lastError}</p>
            ) : null}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => triggerSessionAction("reconnect")}
              className="rounded-md border border-zinc-700/60 bg-zinc-800/80 px-3 py-1.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700/80"
            >
              Reconnect
            </button>
            <button
              onClick={() => triggerSessionAction("logout")}
              className="rounded-md border border-zinc-700/60 bg-zinc-800/80 px-3 py-1.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700/80"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/80 p-5 lg:col-span-4">
          <h2 className="mb-3 font-medium">QR</h2>
          <QrViewer qrDataUrl={qrDataUrl} />
          <button
            onClick={takeScreenshot}
            disabled={capturingScreenshot}
            className="mt-3 rounded-md border border-zinc-700/60 bg-zinc-800/80 px-3 py-1.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700/80 disabled:opacity-60"
          >
            {capturingScreenshot ? "Capturing..." : "Take Screenshot"}
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-12">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/80 p-5 lg:col-span-5">
          <h2 className="mb-3 font-medium">Send Test Message</h2>
          <SendTestForm
            sessionId={selectedSessionId}
            onSent={async () => {
              await loadState();
            }}
          />
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/80 p-5 lg:col-span-7">
          <h2 className="mb-3 font-medium">Recent Jobs</h2>
          <ul className="max-h-[26rem] space-y-2 overflow-auto pr-1 text-sm">
            {(state?.jobLogs ?? []).map((job) => (
              <li
                key={`${job.jobId}-${job.createdAt}`}
                className="rounded-md border border-zinc-700/60 bg-zinc-800/70 p-2.5"
              >
                <p className="font-medium">
                  {job.type} · {job.status}
                </p>
                <p className="text-zinc-400">session: {job.sessionId}</p>
                <p className="text-zinc-400">{job.message}</p>
              </li>
            ))}
            {!state?.jobLogs?.length ? <li className="text-zinc-400">No jobs yet.</li> : null}
          </ul>
        </div>
      </section>

      {/* ---- Chat Panel ---- */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Chat</h2>
        <ChatPanel sessionId={selectedSessionId} />
      </section>

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/80 p-5">
        <h2 className="mb-3 font-medium">Latest WhatsApp Screenshot</h2>
        {screenshotDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={screenshotDataUrl}
            alt="WhatsApp session screenshot"
            className="max-h-[32rem] w-full rounded-md border border-zinc-700/60 bg-zinc-800/70 object-contain"
          />
        ) : (
          <p className="text-sm text-zinc-400">No screenshot captured yet.</p>
        )}
      </section>
    </div>
  );
}
