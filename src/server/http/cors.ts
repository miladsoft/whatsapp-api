import { NextRequest, NextResponse } from "next/server";

const DEFAULT_HEADERS = "Content-Type, X-API-Key";
const DEFAULT_METHODS = "GET, POST, OPTIONS";

function getAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS ?? "";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getCorsHeaders(request: NextRequest): HeadersInit {
  const allowedOrigins = getAllowedOrigins();
  const origin = request.headers.get("origin");
  const allowAny = allowedOrigins.includes("*");
  const isAllowedOrigin = origin ? allowedOrigins.includes(origin) : false;

  const headers: HeadersInit = {
    "Access-Control-Allow-Methods": DEFAULT_METHODS,
    "Access-Control-Allow-Headers": DEFAULT_HEADERS,
  };

  if (allowAny) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (isAllowedOrigin && origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }

  return headers;
}

export function withCors(request: NextRequest, response: NextResponse) {
  const headers = getCorsHeaders(request);

  Object.entries(headers).forEach(([key, value]) => {
    if (value !== undefined) {
      response.headers.set(key, value);
    }
  });

  return response;
}

export function optionsResponse(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}
