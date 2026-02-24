"use client";

import { useMemo, useRef, useState } from "react";

type BulkTextNumbersFormProps = {
  sessionId: string;
  onSent?: () => Promise<void> | void;
};

function normalizeDigits(value: string) {
  return value.replace(/[^\d]/g, "");
}

function parseNumberLines(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const validNumbers: string[] = [];
  const invalidLines: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const digits = normalizeDigits(line);
    if (!/^\d{8,15}$/.test(digits)) {
      invalidLines.push(line);
      continue;
    }

    if (!seen.has(digits)) {
      seen.add(digits);
      validNumbers.push(digits);
    }
  }

  return {
    totalLines: lines.length,
    validNumbers,
    invalidLines,
  };
}

export function BulkTextNumbersForm({ sessionId, onSent }: BulkTextNumbersFormProps) {
  const [numbersText, setNumbersText] = useState("");
  const [messageText, setMessageText] = useState("Hello from WhatsApp API service");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsed = useMemo(() => parseNumberLines(numbersText), [numbersText]);

  async function sendToAll() {
    if (!messageText.trim()) {
      setError("Message text is required");
      return;
    }

    if (!parsed.validNumbers.length) {
      setError("No valid numbers found. Use one number per line.");
      return;
    }

    setSending(true);
    setError(null);
    setResult(null);

    try {
      const outcomes = await Promise.allSettled(
        parsed.validNumbers.map(async (to) => {
          const response = await fetch("/api/admin/send-test", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionId,
              to,
              text: messageText,
            }),
          });

          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.ok) {
            throw new Error(payload?.error?.message || `Failed to queue for ${to}`);
          }
        }),
      );

      const successCount = outcomes.filter((item) => item.status === "fulfilled").length;
      const failedCount = outcomes.length - successCount;
      setResult(`Bulk send finished. Success: ${successCount}, Failed: ${failedCount}`);

      if (onSent) {
        await onSent();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send bulk text list");
    } finally {
      setSending(false);
    }
  }

  async function importTextFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      setNumbersText(content);
      setError(null);
      setResult(`Loaded ${file.name}`);
    } catch {
      setError("Failed to read file content");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-emerald-100">Bulk From Text List</h3>
        <p className="mt-1 text-xs text-emerald-200/70">
          Paste numbers copied from a text file. One mobile number per line.
        </p>
      </div>

      <div>
        <label htmlFor="bulk-text-numbers" className="mb-1.5 block text-sm font-medium text-emerald-100">
          Mobile Numbers (one per line)
        </label>
        <div className="mb-2 flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            onChange={importTextFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-emerald-700/50 bg-emerald-900/40 px-2.5 py-1.5 text-xs font-medium text-emerald-100 transition-colors hover:bg-emerald-800/50"
          >
            Import .txt
          </button>
          <span className="text-xs text-emerald-200/70">or paste numbers directly below</span>
        </div>
        <textarea
          id="bulk-text-numbers"
          value={numbersText}
          onChange={(event) => setNumbersText(event.target.value)}
          placeholder={"989121234567\n15551234567\n447700900123"}
          className="min-h-44 w-full rounded-md border border-emerald-900/60 bg-zinc-900/80 px-3 py-2 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
        />
      </div>

      <div>
        <label htmlFor="bulk-text-message" className="mb-1.5 block text-sm font-medium text-emerald-100">
          Message
        </label>
        <textarea
          id="bulk-text-message"
          value={messageText}
          onChange={(event) => setMessageText(event.target.value)}
          className="min-h-24 w-full rounded-md border border-emerald-900/60 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
        />
      </div>

      <div className="rounded-md border border-emerald-900/50 bg-emerald-950/20 p-3 text-xs text-emerald-100/90">
        <p>Total lines: {parsed.totalLines}</p>
        <p>Valid numbers: {parsed.validNumbers.length}</p>
        <p>Invalid lines: {parsed.invalidLines.length}</p>
      </div>

      {parsed.invalidLines.length ? (
        <div className="rounded-md border border-amber-700/40 bg-amber-950/30 p-3">
          <p className="mb-1 text-xs font-medium text-amber-200">Invalid lines (first 10):</p>
          <ul className="space-y-1 text-xs text-amber-100/90">
            {parsed.invalidLines.slice(0, 10).map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        onClick={sendToAll}
        disabled={sending || !parsed.validNumbers.length}
        className="rounded-md border border-lime-500/40 bg-lime-900/30 px-3 py-1.5 text-sm font-medium text-lime-100 transition-colors hover:bg-lime-800/40 disabled:opacity-60"
      >
        {sending ? "Sending..." : "◉ Send to All Parsed Numbers"}
      </button>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {result ? <p className="text-sm text-emerald-300">{result}</p> : null}
    </div>
  );
}
