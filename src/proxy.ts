import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isAdminAuthorized } from "@/server/auth/admin";

export function proxy(request: NextRequest) {
  const isAuthorized = isAdminAuthorized(request.headers.get("authorization"));
  if (isAuthorized) {
    return NextResponse.next();
  }

  const isApiRequest = request.nextUrl.pathname.startsWith("/api/");
  if (isApiRequest) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Admin Area"',
        },
      },
    );
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Admin Area"',
    },
  });
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
