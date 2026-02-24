"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Contact = {
  id: string;
  number: string;
  name: string;
  pushname?: string | null;
  shortName?: string | null;
  isBusiness: boolean;
  isEnterprise: boolean;
  isMyContact: boolean;
  isBlocked: boolean;
  isGroup: boolean;
  isWAContact: boolean;
};

function escapeCsvCell(value: string | number | boolean | null | undefined) {
  const raw = value == null ? "" : String(value);
  const escaped = raw.replaceAll('"', '""');
  return `"${escaped}"`;
}

function toCsv(contacts: Contact[]) {
  const headers = [
    "id",
    "number",
    "name",
    "pushname",
    "shortName",
    "isBusiness",
    "isEnterprise",
    "isMyContact",
    "isBlocked",
    "isGroup",
    "isWAContact",
  ];

  const rows = contacts.map((contact) =>
    [
      contact.id,
      contact.number,
      contact.name,
      contact.pushname ?? "",
      contact.shortName ?? "",
      contact.isBusiness,
      contact.isEnterprise,
      contact.isMyContact,
      contact.isBlocked,
      contact.isGroup,
      contact.isWAContact,
    ]
      .map((cell) => escapeCsvCell(cell))
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

export function ContactsPanel({ sessionId }: { sessionId: string }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filteredContacts = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return contacts;

    return contacts.filter((contact) => {
      return (
        contact.name.toLowerCase().includes(value) ||
        contact.number.toLowerCase().includes(value) ||
        contact.id.toLowerCase().includes(value) ||
        (contact.pushname ?? "").toLowerCase().includes(value)
      );
    });
  }, [contacts, query]);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/admin/contacts?sessionId=${encodeURIComponent(sessionId)}`,
        { cache: "no-store" },
      );

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message || "Failed to load contacts");
      }

      setContacts(payload.data.contacts ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contacts");
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const exportCsv = useCallback(() => {
    setExporting(true);
    try {
      const csv = toCsv(filteredContacts);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().replaceAll(":", "-");
      link.href = url;
      link.download = `contacts-${sessionId}-${stamp}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [filteredContacts, sessionId]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/80 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Contacts</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={loadContacts}
            disabled={loading}
            className="rounded-md border border-zinc-700/60 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-zinc-700/80 disabled:opacity-60"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button
            onClick={exportCsv}
            disabled={!filteredContacts.length || exporting}
            className="rounded-md border border-zinc-700/60 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-zinc-700/80 disabled:opacity-60"
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </div>

      <div className="mb-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, number, or id"
          className="w-full rounded-md border border-zinc-700/60 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-500"
        />
      </div>

      {error ? (
        <p className="mb-3 rounded-md border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <p className="mb-2 text-xs text-zinc-400">
        Showing {filteredContacts.length} of {contacts.length} contacts
      </p>

      <div className="max-h-[28rem] overflow-auto rounded-lg border border-zinc-800/80">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-zinc-900/95 text-zinc-300">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Number</th>
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {filteredContacts.map((contact) => (
              <tr key={contact.id} className="border-t border-zinc-800/80 text-zinc-200">
                <td className="px-3 py-2">{contact.name || "-"}</td>
                <td className="px-3 py-2">{contact.number || "-"}</td>
                <td className="px-3 py-2 text-xs text-zinc-400">{contact.id}</td>
                <td className="px-3 py-2 text-xs text-zinc-400">
                  {[contact.isMyContact ? "my" : null, contact.isBusiness ? "biz" : null, contact.isBlocked ? "blocked" : null, contact.isGroup ? "group" : null]
                    .filter(Boolean)
                    .join(" · ") || "-"}
                </td>
              </tr>
            ))}
            {!loading && !filteredContacts.length ? (
              <tr>
                <td className="px-3 py-3 text-zinc-400" colSpan={4}>
                  No contacts found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
