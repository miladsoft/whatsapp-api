type QrViewerProps = {
  qrDataUrl: string | null;
};

export function QrViewer({ qrDataUrl }: QrViewerProps) {
  if (!qrDataUrl) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-700/60 bg-zinc-800/70 p-6 text-center text-sm text-zinc-400">
        QR is unavailable. Session might already be connected.
      </div>
    );
  }

  return (
    <div className="flex justify-center rounded-lg border border-zinc-700/60 bg-zinc-800/70 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrDataUrl} alt="WhatsApp QR" className="h-64 w-64 rounded-md border border-zinc-700/60 bg-white" />
    </div>
  );
}
