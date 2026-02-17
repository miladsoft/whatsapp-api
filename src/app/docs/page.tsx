"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-4 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-screen-2xl overflow-hidden rounded-xl border border-zinc-800 bg-white">
        <SwaggerUI url="/api/openapi" docExpansion="list" defaultModelsExpandDepth={1} />
      </div>
    </main>
  );
}
