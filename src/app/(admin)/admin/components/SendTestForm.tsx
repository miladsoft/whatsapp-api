"use client";

import { useState } from "react";

type SendTestFormProps = {
  sessionId: string;
  onSent: () => void;
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

export function SendTestForm({ sessionId, onSent }: SendTestFormProps) {
  const [to, setTo] = useState("");
  const [text, setText] = useState("Hello from WhatsApp API service");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/send-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId, to, text }),
      });

      const payload = await readJsonSafely<{ queued: boolean; jobId: string }>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to queue test message"));
      }

      onSent();
      setTo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send test message");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="to" className="mb-1.5 block text-sm font-medium text-zinc-200">
          To (digits)
        </label>
        <input
          id="to"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          placeholder="15551234567"
          className="w-full rounded-md border border-zinc-700/60 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-500"
          required
        />
      </div>
      <div>
        <label htmlFor="text" className="mb-1.5 block text-sm font-medium text-zinc-200">
          Text
        </label>
        <textarea
          id="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-24 w-full rounded-md border border-zinc-700/60 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-500"
          required
        />
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md border border-zinc-700/60 bg-zinc-800/80 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700/80 disabled:opacity-60"
      >
        {submitting ? "Queueing..." : "Send Test"}
      </button>
    </form>
  );
}
