import { NextRequest } from "next/server";

import { fail, ok } from "@/server/http/api";
import { eventStore } from "@/server/store/eventStore";

export const runtime = "nodejs";

/**
 * GET /api/admin/calls?limit=50
 */
export async function GET(request: NextRequest) {
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "50", 10), 200);
  return ok({ calls: eventStore.getCalls(limit) });
}
