import { NextRequest } from "next/server";

import { fail } from "@/server/http/api";

export function requireApiKey(request: NextRequest) {
  const configuredApiKey = process.env.API_KEY;
  if (!configuredApiKey) {
    return fail("INTERNAL_ERROR", "API key is not configured", 500);
  }

  const incomingApiKey = request.headers.get("x-api-key");
  if (!incomingApiKey || incomingApiKey !== configuredApiKey) {
    return fail("UNAUTHORIZED", "Invalid API key", 401);
  }

  return null;
}

export function requireWorkerToken(request: NextRequest) {
  const configuredToken =
    process.env.WORKER_TOKEN ||
    process.env.API_KEY ||
    (process.env.NODE_ENV !== "production" ? "dev-worker-token" : undefined);
  if (!configuredToken) {
    return fail("INTERNAL_ERROR", "Worker token is not configured", 500);
  }

  const incomingToken = request.headers.get("x-worker-token");
  if (!incomingToken || incomingToken !== configuredToken) {
    return fail("UNAUTHORIZED", "Invalid worker token", 401);
  }

  return null;
}
