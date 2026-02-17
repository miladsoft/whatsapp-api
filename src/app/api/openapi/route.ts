import { NextResponse } from "next/server";

import { openApiDocument } from "@/server/http/openapi";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(openApiDocument, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
