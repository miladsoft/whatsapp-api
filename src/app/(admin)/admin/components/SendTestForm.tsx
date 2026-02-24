"use client";

import { useEffect, useRef, useState } from "react";

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

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png"];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [imageFile]);

  function validateImageFile(file: File) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return "Only JPG and PNG images are allowed";
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return "Image size must be 5MB or less";
    }
    return null;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTo = to.replace(/[^\d]/g, "");
    if (!text.trim() && !imageFile) {
      setError("Text or photo is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = imageFile
        ? await (async () => {
            const formData = new FormData();
            formData.append("sessionId", sessionId);
            formData.append("chatId", normalizedTo || to);
            if (text.trim()) {
              formData.append("caption", text.trim());
            }
            formData.append("file", imageFile);
            return fetch("/api/admin/messages/media", {
              method: "POST",
              body: formData,
            });
          })()
        : await fetch("/api/admin/send-test", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ sessionId, to: normalizedTo || to, text }),
          });

      const payload = await readJsonSafely<{ queued: boolean; jobId: string }>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(
          getApiErrorMessage(payload, imageFile ? "Failed to send test photo" : "Failed to queue test message"),
        );
      }

      onSent();
      setTo("");
      setImageFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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
          Text / Caption
        </label>
        <textarea
          id="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-24 w-full rounded-md border border-zinc-700/60 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-500"
        />
      </div>

      <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (!file) {
                setImageFile(null);
                return;
              }

              const validationError = validateImageFile(file);
              if (validationError) {
                setError(validationError);
                setImageFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
                return;
              }

              setError(null);
              setImageFile(file);
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-zinc-600/60 bg-zinc-800/80 px-2.5 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-zinc-700/80"
          >
            {imageFile ? "Change Photo" : "Attach Photo"}
          </button>
          {imageFile ? (
            <button
              type="button"
              onClick={() => {
                setImageFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
              className="rounded-md border border-red-700/50 bg-red-950/40 px-2.5 py-1.5 text-xs font-medium text-red-200 transition-colors hover:bg-red-900/50"
            >
              Remove
            </button>
          ) : null}
          <span className="text-xs text-zinc-400">Optional: send image with optional caption</span>
        </div>
        {imageFile ? (
          <div className="mt-2 rounded-md border border-zinc-700/60 bg-zinc-900/60 p-2">
            {imagePreviewUrl ? (
              <img
                src={imagePreviewUrl}
                alt="Selected preview"
                className="mb-2 max-h-44 w-auto rounded border border-zinc-700/60"
              />
            ) : null}
            <p className="text-xs text-zinc-300">
              Selected: {imageFile.name} ({(imageFile.size / 1024).toFixed(1)} KB)
            </p>
          </div>
        ) : null}
        <p className="mt-2 text-[11px] text-zinc-400">Allowed: JPG/PNG, max 5MB</p>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md border border-zinc-700/60 bg-zinc-800/80 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700/80 disabled:opacity-60"
      >
        {submitting ? "Sending..." : imageFile ? "Send Test Photo" : "Send Test"}
      </button>
    </form>
  );
}
