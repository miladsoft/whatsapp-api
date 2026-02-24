"use client";

import { useEffect, useRef } from "react";

import "swagger-ui-dist/swagger-ui.css";

export default function DocsPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    const mountNode = mountRef.current;

    const setup = async () => {
      const [{ default: SwaggerUIBundle }, { default: SwaggerUIStandalonePreset }] =
        await Promise.all([
          import("swagger-ui-dist/swagger-ui-bundle"),
          import("swagger-ui-dist/swagger-ui-standalone-preset"),
        ]);

      if (disposed || !mountNode) return;

      SwaggerUIBundle({
        url: "/api/openapi",
        domNode: mountNode,
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
      if (mountNode) {
        mountNode.innerHTML = "";
      }
    };
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-4 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-screen-2xl overflow-hidden rounded-xl border border-zinc-300 bg-white dark:border-zinc-800">
        <div ref={mountRef} />
      </div>
    </main>
  );
}
