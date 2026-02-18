"use client";

import { useEffect, useRef } from "react";

import "swagger-ui-dist/swagger-ui.css";

export default function DocsPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;

    const setup = async () => {
      const [{ default: SwaggerUIBundle }, { default: SwaggerUIStandalonePreset }] =
        await Promise.all([
          import("swagger-ui-dist/swagger-ui-bundle"),
          import("swagger-ui-dist/swagger-ui-standalone-preset"),
        ]);

      if (disposed || !mountRef.current) return;

      SwaggerUIBundle({
        url: "/api/openapi",
        domNode: mountRef.current,
        docExpansion: "list",
        defaultModelsExpandDepth: 1,
        displayRequestDuration: true,
        deepLinking: true,
        persistAuthorization: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
      });
    };

    void setup();

    return () => {
      disposed = true;
      if (mountRef.current) {
        mountRef.current.innerHTML = "";
      }
    };
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-4 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-screen-2xl overflow-hidden rounded-xl border border-zinc-800 bg-white">
        <div ref={mountRef} />
      </div>
    </main>
  );
}
