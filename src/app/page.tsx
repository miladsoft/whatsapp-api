export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold">WhatsApp API Service</h1>
      <p className="mt-3 text-zinc-500">
        Service is running. Open the admin dashboard to connect WhatsApp and send test messages.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href="/admin"
          className="inline-flex w-fit rounded-md bg-foreground px-4 py-2 text-sm text-background shadow-sm"
        >
          Open Admin Dashboard
        </a>
        <a
          href="/docs"
          className="inline-flex w-fit rounded-md border border-zinc-700/60 bg-zinc-900/70 px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-zinc-800/80"
        >
          Open API Docs (Swagger)
        </a>
      </div>
      <p className="mt-4 text-sm text-zinc-500">API base: /api/v1</p>
    </main>
  );
}
