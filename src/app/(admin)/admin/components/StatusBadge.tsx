import type { SessionStatus } from "@/server/store/statusStore";

const statusStyles: Record<SessionStatus, string> = {
  connecting: "bg-amber-100 text-amber-700",
  qr: "bg-blue-100 text-blue-700",
  authenticated: "bg-cyan-100 text-cyan-700",
  ready: "bg-emerald-100 text-emerald-700",
  disconnected: "bg-zinc-200 text-zinc-700",
  auth_failure: "bg-red-100 text-red-700",
  unknown: "bg-zinc-200 text-zinc-700",
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyles[status]}`}
    >
      {status}
    </span>
  );
}
