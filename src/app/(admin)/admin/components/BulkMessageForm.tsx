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

type BulkMessageFormProps = {
  sessionId: string;
  onSent?: () => Promise<void> | void;
};

function normalizeDigits(value: string) {
  return value.replace(/[^\d]/g, "");
}

export function BulkMessageForm({ sessionId, onSent }: BulkMessageFormProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [text, setText] = useState("Hello from WhatsApp API service");
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const filteredContacts = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) {
      return contacts;
    }

    return contacts.filter((contact) => {
      return (
        contact.name.toLowerCase().includes(value) ||
        contact.number.toLowerCase().includes(value) ||
        contact.id.toLowerCase().includes(value) ||
        (contact.pushname ?? "").toLowerCase().includes(value)
      );
    });
  }, [contacts, query]);

  const selectedContacts = useMemo(() => {
    const selected = new Set(selectedIds);
    return contacts.filter((contact) => selected.has(contact.id));
  }, [contacts, selectedIds]);

  const selectableFilteredIds = useMemo(() => {
    return filteredContacts
      .filter((contact) => normalizeDigits(contact.number).length >= 8)
      .map((contact) => contact.id);
  }, [filteredContacts]);

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const response = await fetch(
        `/api/admin/contacts?sessionId=${encodeURIComponent(sessionId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message || "Failed to load contacts");
      }

      const nextContacts = (payload?.data?.contacts ?? []) as Contact[];
      setContacts(nextContacts);
      setSelectedIds((current) => {
        const validIds = new Set(nextContacts.map((item) => item.id));
        return current.filter((id) => validIds.has(id));
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contacts");
      setContacts([]);
      setSelectedIds([]);
    } finally {
      setLoadingContacts(false);
    }
  }, [sessionId]);

  const toggleContact = useCallback((contactId: string) => {
    setSelectedIds((current) => {
      if (current.includes(contactId)) {
        return current.filter((id) => id !== contactId);
      }
      return [...current, contactId];
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedIds((current) => Array.from(new Set([...current, ...selectableFilteredIds])));
  }, [selectableFilteredIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const sendOne = useCallback(
    async (contact: Contact) => {
      const to = normalizeDigits(contact.number);
      if (!to || to.length < 8 || !text.trim()) {
        throw new Error(`Invalid recipient for ${contact.name || contact.id}`);
      }

      const response = await fetch("/api/admin/send-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          to,
          text,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message || `Failed to queue message for ${to}`);
      }
    },
    [sessionId, text],
  );

  const sendSequential = useCallback(async () => {
    const recipients = selectedContacts.filter((contact) => normalizeDigits(contact.number).length >= 8);
    if (!recipients.length) {
      setError("At least one valid contact must be selected");
      return;
    }
    if (!text.trim()) {
      setError("Message text is required");
      return;
    }

    setSending(true);
    setError(null);
    setResult(null);
    let successCount = 0;

    try {
      for (const contact of recipients) {
        try {
          await sendOne(contact);
          successCount += 1;
        } catch {
          // continue to next recipient
        }
      }

      const failed = recipients.length - successCount;
      setResult(`Sequential send finished. Success: ${successCount}, Failed: ${failed}`);
      if (onSent) await onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send selected contacts");
    } finally {
      setSending(false);
    }
  }, [onSent, selectedContacts, sendOne, text]);

  const sendBroadcast = useCallback(async () => {
    const recipients = selectedContacts.filter((contact) => normalizeDigits(contact.number).length >= 8);
    if (!recipients.length) {
      setError("At least one valid contact must be selected");
      return;
    }
    if (!text.trim()) {
      setError("Message text is required");
      return;
    }

    setSending(true);
    setError(null);
    setResult(null);

    try {
      const outcomes = await Promise.allSettled(recipients.map((contact) => sendOne(contact)));
      const successCount = outcomes.filter((item) => item.status === "fulfilled").length;
      const failed = recipients.length - successCount;

      setResult(`Broadcast send finished. Success: ${successCount}, Failed: ${failed}`);
      if (onSent) await onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to broadcast");
    } finally {
      setSending(false);
    }
  }, [onSent, selectedContacts, sendOne, text]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium text-emerald-100">Bulk Message</h3>
          <p className="text-xs text-emerald-200/70">
            Select contacts and send as sequential or broadcast.
          </p>
        </div>
        <button
          onClick={loadContacts}
          disabled={loadingContacts}
          className="rounded-md border border-emerald-700/50 bg-emerald-900/40 px-3 py-1.5 text-xs font-medium text-emerald-100 transition-colors hover:bg-emerald-800/50 disabled:opacity-60"
        >
          {loadingContacts ? "Loading..." : "↻ Refresh Contacts"}
        </button>
      </div>

      <div>
        <label htmlFor="bulk-message-text" className="mb-1.5 block text-sm font-medium text-emerald-100">
          Message
        </label>
        <textarea
          id="bulk-message-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-24 w-full rounded-md border border-emerald-900/60 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
          required
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={sendSequential}
          disabled={sending || !selectedIds.length}
          className="rounded-md border border-emerald-600/50 bg-emerald-900/50 px-3 py-1.5 text-sm font-medium text-emerald-100 transition-colors hover:bg-emerald-800/60 disabled:opacity-60"
        >
          {sending ? "Sending..." : "● Send One by One"}
        </button>
        <button
          onClick={sendBroadcast}
          disabled={sending || !selectedIds.length}
          className="rounded-md border border-lime-500/40 bg-lime-900/30 px-3 py-1.5 text-sm font-medium text-lime-100 transition-colors hover:bg-lime-800/40 disabled:opacity-60"
        >
          {sending ? "Sending..." : "◉ Send Broadcast"}
        </button>
        <span className="text-xs text-emerald-200/80">Selected: {selectedIds.length}</span>
      </div>

      <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contacts"
            className="w-full max-w-sm rounded-md border border-emerald-900/60 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
          />
          <button
            onClick={selectAllFiltered}
            className="rounded-md border border-emerald-700/40 bg-emerald-900/40 px-2.5 py-1.5 text-xs font-medium text-emerald-100 transition-colors hover:bg-emerald-800/50"
          >
            Select Filtered
          </button>
          <button
            onClick={clearSelection}
            className="rounded-md border border-emerald-700/40 bg-emerald-900/40 px-2.5 py-1.5 text-xs font-medium text-emerald-100 transition-colors hover:bg-emerald-800/50"
          >
            Clear
          </button>
        </div>

        <div className="max-h-[26rem] overflow-auto rounded-md border border-emerald-900/50">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-emerald-950/80 text-emerald-100">
              <tr>
                <th className="w-12 px-3 py-2 font-medium">Pick</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Number</th>
                <th className="px-3 py-2 font-medium">ID</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((contact) => {
                const disabled = normalizeDigits(contact.number).length < 8;
                const checked = selectedIds.includes(contact.id);
                return (
                  <tr key={contact.id} className="border-t border-zinc-800/80 text-zinc-200">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleContact(contact.id)}
                      />
                    </td>
                    <td className="px-3 py-2">{contact.name || "-"}</td>
                    <td className="px-3 py-2">{contact.number || "-"}</td>
                    <td className="px-3 py-2 text-xs text-zinc-400">{contact.id}</td>
                  </tr>
                );
              })}
              {!loadingContacts && !filteredContacts.length ? (
                <tr>
                  <td className="px-3 py-3 text-zinc-400" colSpan={4}>
                    No contacts found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {result ? <p className="text-sm text-emerald-300">{result}</p> : null}
    </div>
  );
}
