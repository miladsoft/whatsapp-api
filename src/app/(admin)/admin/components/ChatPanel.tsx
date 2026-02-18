"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/* ========================================================================== */
/*  Types                                                                      */
/* ========================================================================== */

interface WaMessage {
  id: string;
  sessionId: string;
  from: string;
  to: string;
  fromMe: boolean;
  body: string;
  type: string;
  timestamp: number;
  hasMedia: boolean;
  mediaUrl?: string;
  mimetype?: string;
  filename?: string;
  isForwarded: boolean;
  isStarred: boolean;
  isStatus: boolean;
  ack: number;
  author?: string;
  mentionedIds: string[];
  hasQuotedMsg: boolean;
  quotedMsgId?: string;
  location?: { latitude: number; longitude: number; description?: string };
  vCards: string[];
  chatName?: string;
  contactName?: string;
}

interface Chat {
  id: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  timestamp: number;
  lastMessage?: { body: string; type: string; timestamp: number; fromMe: boolean } | null;
  archived: boolean;
  pinned: boolean;
  muteExpiration?: number;
}

type SseEvent = {
  type: string;
  sessionId: string;
  timestamp: number;
  payload: Record<string, unknown>;
};

type LoadedMedia = {
  dataUrl: string;
  mimetype: string;
  filename?: string | null;
};

/* ========================================================================== */
/*  Helpers                                                                    */
/* ========================================================================== */

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const ACK_LABELS: Record<number, string> = {
  [-1]: "error",
  0: "pending",
  1: "sent",
  2: "delivered",
  3: "read",
  4: "played",
};

function ackIcon(ack: number) {
  if (ack >= 3) return "✓✓"; // read
  if (ack === 2) return "✓✓"; // delivered (grey ticks)
  if (ack === 1) return "✓";  // sent
  return "⏳";
}

function sortChatsByPriority(items: Chat[]) {
  return [...items].sort((first, second) => {
    if (first.pinned !== second.pinned) {
      return first.pinned ? -1 : 1;
    }
    return (second.timestamp ?? 0) - (first.timestamp ?? 0);
  });
}

/* ========================================================================== */
/*  Main Component                                                             */
/* ========================================================================== */

export function ChatPanel({ sessionId }: { sessionId: string }) {
  /* ---- state ---- */
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    msg: WaMessage;
    x: number;
    y: number;
  } | null>(null);
  const [replyTo, setReplyTo] = useState<WaMessage | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [showMediaPreview, setShowMediaPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarByChatId, setAvatarByChatId] = useState<Record<string, string>>({});
  const [mediaByMessageId, setMediaByMessageId] = useState<Record<string, LoadedMedia>>({});

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const avatarLoadingRef = useRef<Set<string>>(new Set());
  const messageMediaLoadingRef = useRef<Set<string>>(new Set());

  /* ---- derived ---- */
  const filteredChats = useMemo(() => {
    if (!chatSearch.trim()) return chats;
    const q = chatSearch.toLowerCase();
    return chats.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    );
  }, [chats, chatSearch]);

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const loadAvatar = useCallback(
    async (chatId: string) => {
      if (!chatId) return;
      if (avatarByChatId[chatId]) return;
      if (avatarLoadingRef.current.has(chatId)) return;

      avatarLoadingRef.current.add(chatId);
      try {
        const res = await fetch(
          `/api/admin/chats/avatar?sessionId=${encodeURIComponent(sessionId)}&chatId=${encodeURIComponent(chatId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;

        const payload = await res.json();
        const profilePicUrl = payload?.data?.profilePicUrl;
        if (typeof profilePicUrl === "string" && profilePicUrl.length > 0) {
          setAvatarByChatId((prev) => ({ ...prev, [chatId]: profilePicUrl }));
        }
      } catch {
        // ignore avatar fetch failures
      } finally {
        avatarLoadingRef.current.delete(chatId);
      }
    },
    [avatarByChatId, sessionId],
  );

  const loadMessageMedia = useCallback(
    async (messageId: string) => {
      if (!messageId) return;
      if (mediaByMessageId[messageId]) return;
      if (messageMediaLoadingRef.current.has(messageId)) return;

      messageMediaLoadingRef.current.add(messageId);
      try {
        const res = await fetch(
          `/api/admin/messages/media?sessionId=${encodeURIComponent(sessionId)}&messageId=${encodeURIComponent(messageId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;

        const payload = await res.json();
        const data = payload?.data;
        if (data?.dataUrl && data?.mimetype) {
          setMediaByMessageId((prev) => ({
            ...prev,
            [messageId]: {
              dataUrl: data.dataUrl,
              mimetype: data.mimetype,
              filename: data.filename,
            },
          }));
        }
      } catch {
        // ignore media fetch failures for individual messages
      } finally {
        messageMediaLoadingRef.current.delete(messageId);
      }
    },
    [mediaByMessageId, sessionId],
  );

  const upsertChatOnActivity = useCallback(
    (msg: WaMessage) => {
      const chatId = msg.fromMe ? msg.to : msg.from;

      setChats((prev) => {
        const currentIndex = prev.findIndex((c) => c.id === chatId);

        if (currentIndex === -1) {
          const newChat: Chat = {
            id: chatId,
            name: msg.chatName || msg.contactName || chatId,
            isGroup: chatId.endsWith("@g.us"),
            unreadCount: !msg.fromMe && chatId !== selectedChatId ? 1 : 0,
            timestamp: msg.timestamp,
            lastMessage: {
              body: msg.body,
              type: msg.type,
              timestamp: msg.timestamp,
              fromMe: msg.fromMe,
            },
            archived: false,
            pinned: false,
          };

          return sortChatsByPriority([newChat, ...prev]);
        }

        const updated = [...prev];
        const current = updated[currentIndex];
        updated[currentIndex] = {
          ...current,
          name: current.name || msg.chatName || msg.contactName || current.id,
          lastMessage: {
            body: msg.body,
            type: msg.type,
            timestamp: msg.timestamp,
            fromMe: msg.fromMe,
          },
          timestamp: msg.timestamp,
          unreadCount:
            !msg.fromMe && chatId !== selectedChatId
              ? current.unreadCount + 1
              : current.unreadCount,
        };

        return sortChatsByPriority(updated);
      });
    },
    [selectedChatId],
  );

  const appendMessageToCurrentChat = useCallback((msg: WaMessage) => {
    const chatId = msg.fromMe ? msg.to : msg.from;
    const isCurrentChat =
      !!selectedChatId &&
      (chatId === selectedChatId || msg.from === selectedChatId || msg.to === selectedChatId);

    if (isCurrentChat) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) {
          return prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m));
        }
        return [...prev, msg];
      });
    }

    upsertChatOnActivity(msg);
  }, [selectedChatId, upsertChatOnActivity]);

  /* ---- load chats ---- */
  const loadChats = useCallback(async () => {
    setLoadingChats(true);
    try {
      const res = await fetch(
        `/api/admin/chats?sessionId=${encodeURIComponent(sessionId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Failed to load chats");
      const json = await res.json();
      if (json.ok) {
        setChats(sortChatsByPriority(json.data.chats ?? []));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chats");
    } finally {
      setLoadingChats(false);
    }
  }, [sessionId]);

  /* ---- load messages for selected chat ---- */
  const loadMessages = useCallback(
    async (chatId: string) => {
      setLoadingMessages(true);
      try {
        // Fetch from event store first (in-memory recent)
        const res = await fetch(
          `/api/admin/messages?sessionId=${encodeURIComponent(sessionId)}&chatId=${encodeURIComponent(chatId)}&limit=100`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("Failed to load messages");
        const json = await res.json();
        if (json.ok) {
          setMessages(json.data.messages ?? []);
        }

        // Also try to load from the client (more complete history)
        const res2 = await fetch(
          `/api/admin/chats/messages?sessionId=${encodeURIComponent(sessionId)}&chatId=${encodeURIComponent(chatId)}&limit=50`,
          { cache: "no-store" },
        );
        if (res2.ok) {
          const json2 = await res2.json();
          if (json2.ok && json2.data.messages?.length) {
            setMessages((prev) => {
              // merge and deduplicate by id, keeping newest version
              const map = new Map<string, WaMessage>();
              for (const m of json2.data.messages) map.set(m.id, m);
              for (const m of prev) map.set(m.id, m); // event store has more recent data
              const all = Array.from(map.values());
              all.sort((a, b) => a.timestamp - b.timestamp);
              return all;
            });
          }
        }
      } catch {
        // silently fail on history load
      } finally {
        setLoadingMessages(false);
      }
    },
    [sessionId],
  );

  /* ---- send message ---- */
  const sendMessage = useCallback(async () => {
    if ((!composerText.trim() && !mediaFile) || !selectedChatId) return;
    setSending(true);
    setError(null);

    try {
      if (mediaFile) {
        // Send via media endpoint
        const formData = new FormData();
        formData.append("chatId", selectedChatId);
        formData.append("sessionId", sessionId);
        formData.append("file", mediaFile);
        if (composerText.trim()) formData.append("caption", composerText.trim());

        const res = await fetch("/api/admin/messages/media", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const failure = await res.json().catch(() => null);
          throw new Error(failure?.error?.message || "Failed to send media");
        }

        const payload = await res.json();
        const messageId = payload?.data?.messageId;
        if (messageId) {
          appendMessageToCurrentChat({
            id: messageId,
            sessionId,
            from: "me",
            to: selectedChatId,
            fromMe: true,
            body: composerText.trim(),
            type: mediaFile.type.startsWith("image/")
              ? "image"
              : mediaFile.type.startsWith("video/")
                ? "video"
                : mediaFile.type.startsWith("audio/")
                  ? "audio"
                  : "document",
            timestamp: Date.now(),
            hasMedia: true,
            mimetype: mediaFile.type,
            filename: mediaFile.name,
            isForwarded: false,
            isStarred: false,
            isStatus: false,
            ack: 0,
            mentionedIds: [],
            hasQuotedMsg: false,
            vCards: [],
          });
        }
      } else {
        // Send text via admin direct-send endpoint
        const body: Record<string, unknown> = {
          sessionId,
          chatId: selectedChatId,
          text: composerText.trim(),
        };
        if (replyTo) {
          body.quotedMessageId = replyTo.id;
        }
        const res = await fetch("/api/admin/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const failure = await res.json().catch(() => null);
          throw new Error(failure?.error?.message || "Failed to send message");
        }

        const payload = await res.json();
        const messageId = payload?.data?.messageId;
        if (messageId) {
          appendMessageToCurrentChat({
            id: messageId,
            sessionId,
            from: "me",
            to: selectedChatId,
            fromMe: true,
            body: composerText.trim(),
            type: "chat",
            timestamp: Date.now(),
            hasMedia: false,
            isForwarded: false,
            isStarred: false,
            isStatus: false,
            ack: 0,
            mentionedIds: [],
            hasQuotedMsg: !!replyTo,
            quotedMsgId: replyTo?.id,
            vCards: [],
          });
        }
      }

      setComposerText("");
      setReplyTo(null);
      setMediaFile(null);
      setShowMediaPreview(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }, [composerText, mediaFile, selectedChatId, sessionId, replyTo, appendMessageToCurrentChat]);

  /* ---- message actions ---- */
  const performAction = useCallback(
    async (action: string, messageId: string, extra?: Record<string, unknown>) => {
      setContextMenu(null);
      try {
        const res = await fetch("/api/admin/messages/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, messageId, action, ...extra }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error?.message || "Action failed");
        }
        // Refresh messages after action
        if (selectedChatId) await loadMessages(selectedChatId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      }
    },
    [sessionId, selectedChatId, loadMessages],
  );

  /* ---- SSE real-time subscription ---- */
  useEffect(() => {
    const evtSource = new EventSource(
      `/api/admin/events?sessionId=${encodeURIComponent(sessionId)}`,
    );

    evtSource.addEventListener("message", (e) => {
      try {
        const event: SseEvent = JSON.parse(e.data);
        const msg = event.payload as unknown as WaMessage;
        if (!msg?.id) return;

        appendMessageToCurrentChat(msg);
      } catch { /* ignore parse errors */ }
    });

    evtSource.addEventListener("message_ack", (e) => {
      try {
        const event: SseEvent = JSON.parse(e.data);
        const ack = event.payload as { messageId: string; ack: number };
        setMessages((prev) =>
          prev.map((m) => (m.id === ack.messageId ? { ...m, ack: ack.ack } : m)),
        );
      } catch { /* ignore */ }
    });

    evtSource.addEventListener("message_reaction", (e) => {
      try {
        // Just refresh messages to show reactions
        const event: SseEvent = JSON.parse(e.data);
        void event;
      } catch { /* ignore */ }
    });

    evtSource.onerror = () => {
      // EventSource will auto-reconnect
    };

    return () => evtSource.close();
  }, [sessionId, appendMessageToCurrentChat]);

  /* ---- initial and session-based loads ---- */
  useEffect(() => {
    loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (!chats.length) return;
    const topChats = chats.slice(0, 40);
    for (const chat of topChats) {
      void loadAvatar(chat.id);
    }
  }, [chats, loadAvatar]);

  useEffect(() => {
    if (!messages.length) return;
    const recentMediaMessages = messages.filter((msg) => msg.hasMedia).slice(-12);
    for (const msg of recentMediaMessages) {
      void loadMessageMedia(msg.id);
    }
  }, [messages, loadMessageMedia]);

  useEffect(() => {
    if (selectedChatId) {
      loadMessages(selectedChatId);
    } else {
      setMessages([]);
    }
  }, [selectedChatId, loadMessages]);

  useEffect(() => {
    if (!selectedChatId) return;

    setChats((prev) =>
      prev.map((chat) =>
        chat.id === selectedChatId
          ? {
              ...chat,
              unreadCount: 0,
            }
          : chat,
      ),
    );
  }, [selectedChatId]);

  /* ---- auto-scroll on new messages ---- */
  useLayoutEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ---- close context menu on outside click ---- */
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [contextMenu]);

  /* ---- keyboard shortcut: Enter to send ---- */
  const handleComposerKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  /* ============================================================ */
  /*  Render                                                        */
  /* ============================================================ */

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[500px] overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/80">
      {/* ------ Chat List Sidebar ------ */}
      <aside className="flex w-72 flex-shrink-0 flex-col border-r border-zinc-800/60 lg:w-80">
        {/* Search */}
        <div className="border-b border-zinc-800/60 p-3">
          <div className="flex items-center gap-2">
            <input
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder="Search chats..."
              className="w-full rounded-md border border-zinc-700/60 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-500"
            />
            <button
              onClick={loadChats}
              disabled={loadingChats}
              className="rounded-md border border-zinc-700/60 bg-zinc-800/80 p-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-700/80 disabled:opacity-50"
              title="Refresh chats"
            >
              ↻
            </button>
          </div>
        </div>

        {/* Chat items */}
        <div className="flex-1 overflow-y-auto">
          {loadingChats && !chats.length ? (
            <p className="p-4 text-center text-sm text-zinc-500">Loading chats...</p>
          ) : filteredChats.length === 0 ? (
            <p className="p-4 text-center text-sm text-zinc-500">
              {chatSearch ? "No matching chats" : "No chats yet. Send a message or wait for incoming."}
            </p>
          ) : (
            filteredChats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => {
                  setSelectedChatId(chat.id);
                  setChats((prev) =>
                    prev.map((item) =>
                      item.id === chat.id
                        ? {
                            ...item,
                            unreadCount: 0,
                          }
                        : item,
                    ),
                  );
                  setReplyTo(null);
                  setMediaFile(null);
                  setShowMediaPreview(false);
                }}
                className={`flex w-full items-start gap-3 border-b border-zinc-800/40 px-3 py-3 text-left transition-colors hover:bg-zinc-800/60 ${
                  chat.id === selectedChatId ? "bg-zinc-800/80" : ""
                }`}
              >
                {/* Avatar placeholder */}
                {avatarByChatId[chat.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarByChatId[chat.id]}
                    alt={chat.name || chat.id}
                    className="h-10 w-10 flex-shrink-0 rounded-full border border-zinc-700/60 object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-zinc-700/60 text-sm font-medium text-zinc-300">
                    {chat.isGroup ? "G" : chat.name?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-sm font-medium text-zinc-100">
                      {chat.name || chat.id}
                    </span>
                    {chat.timestamp ? (
                      <span className="flex-shrink-0 text-[10px] text-zinc-500">
                        {formatTime(chat.timestamp)}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs text-zinc-400">
                      {chat.lastMessage?.body || ""}
                    </span>
                    {chat.unreadCount > 0 ? (
                      <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600/80 px-1 text-[10px] font-bold text-white">
                        {chat.unreadCount}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex gap-1">
                    {chat.pinned ? (
                      <span className="text-[9px] text-zinc-500">📌</span>
                    ) : null}
                    {chat.archived ? (
                      <span className="text-[9px] text-zinc-500">📦</span>
                    ) : null}
                    {chat.isGroup ? (
                      <span className="text-[9px] text-zinc-500">👥</span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ------ Main Chat Area ------ */}
      <main className="flex flex-1 flex-col">
        {!selectedChatId ? (
          <div className="flex flex-1 items-center justify-center text-zinc-500">
            <div className="text-center">
              <p className="mb-1 text-4xl">💬</p>
              <p className="text-sm">Select a chat to start messaging</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <header className="flex items-center justify-between border-b border-zinc-800/60 px-4 py-3">
              <div className="flex items-center gap-3">
                {selectedChatId && avatarByChatId[selectedChatId] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarByChatId[selectedChatId]}
                    alt={selectedChat?.name || selectedChatId}
                    className="h-9 w-9 rounded-full border border-zinc-700/60 object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-700/60 text-sm font-medium text-zinc-300">
                    {selectedChat?.isGroup ? "G" : (selectedChat?.name?.[0]?.toUpperCase() || "?")}
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-medium text-zinc-100">
                    {selectedChat?.name || selectedChatId}
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    {selectedChat?.isGroup ? "Group" : "Chat"} · {selectedChatId}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (selectedChatId) loadMessages(selectedChatId);
                  }}
                  className="rounded-md border border-zinc-700/60 bg-zinc-800/80 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700/80"
                  title="Refresh messages"
                >
                  ↻
                </button>
                <button
                  onClick={() =>
                    performAction("sendSeen", "", {}).then(() =>
                      fetch("/api/admin/chats/actions", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          sessionId,
                          chatId: selectedChatId,
                          action: "sendSeen",
                        }),
                      }),
                    )
                  }
                  className="rounded-md border border-zinc-700/60 bg-zinc-800/80 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700/80"
                  title="Mark as read"
                >
                  ✓✓
                </button>
              </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {loadingMessages && !messages.length ? (
                <p className="py-8 text-center text-sm text-zinc-500">Loading messages...</p>
              ) : messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">No messages yet</p>
              ) : (
                <div className="space-y-1">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.fromMe ? "justify-end" : "justify-start"}`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ msg, x: e.clientX, y: e.clientY });
                      }}
                    >
                      <div
                        className={`group relative max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                          msg.fromMe
                            ? "bg-emerald-900/40 text-zinc-100"
                            : "bg-zinc-800/80 text-zinc-100"
                        }`}
                      >
                        {/* Author (for groups) */}
                        {!msg.fromMe && msg.author ? (
                          <p className="mb-0.5 text-[11px] font-medium text-emerald-400/80">
                            {msg.contactName || msg.author}
                          </p>
                        ) : null}

                        {/* Forwarded badge */}
                        {msg.isForwarded ? (
                          <p className="mb-0.5 text-[10px] italic text-zinc-500">↪ Forwarded</p>
                        ) : null}

                        {/* Quoted message */}
                        {msg.hasQuotedMsg && msg.quotedMsgId ? (
                          <div className="mb-1 rounded border-l-2 border-emerald-500/50 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-400">
                            Reply to message
                          </div>
                        ) : null}

                        {/* Location */}
                        {msg.location ? (
                          <div className="mb-1">
                            <a
                              href={`https://maps.google.com/?q=${msg.location.latitude},${msg.location.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 underline"
                            >
                              📍 {msg.location.description || `${msg.location.latitude.toFixed(4)}, ${msg.location.longitude.toFixed(4)}`}
                            </a>
                          </div>
                        ) : null}

                        {/* vCards */}
                        {msg.vCards?.length > 0 ? (
                          <div className="mb-1 text-xs text-zinc-400">
                            📇 Contact card{msg.vCards.length > 1 ? "s" : ""}
                          </div>
                        ) : null}

                        {/* Media indicator */}
                        {msg.hasMedia ? (
                          <div className="mb-1 flex items-center gap-1 text-xs text-zinc-400">
                            <span>
                              {msg.type === "image" ? "🖼" :
                               msg.type === "video" ? "🎥" :
                               msg.type === "audio" || msg.type === "ptt" ? "🎤" :
                               msg.type === "sticker" ? "🏷" :
                               msg.type === "document" ? "📄" : "📎"}
                            </span>
                            <span>{msg.type} {msg.filename ? `(${msg.filename})` : ""}</span>
                          </div>
                        ) : null}

                        {msg.hasMedia ? (
                          <div className="mb-2">
                            {mediaByMessageId[msg.id] ? (
                              mediaByMessageId[msg.id].mimetype.startsWith("image/") ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={mediaByMessageId[msg.id].dataUrl}
                                  alt={msg.filename || "image"}
                                  className="max-h-72 w-full rounded-md border border-zinc-700/50 object-contain"
                                  loading="lazy"
                                />
                              ) : mediaByMessageId[msg.id].mimetype.startsWith("video/") ? (
                                <video
                                  src={mediaByMessageId[msg.id].dataUrl}
                                  controls
                                  className="max-h-80 w-full rounded-md border border-zinc-700/50 bg-black"
                                  preload="metadata"
                                />
                              ) : mediaByMessageId[msg.id].mimetype.startsWith("audio/") ? (
                                <audio
                                  src={mediaByMessageId[msg.id].dataUrl}
                                  controls
                                  className="w-full"
                                  preload="metadata"
                                />
                              ) : (
                                <a
                                  href={mediaByMessageId[msg.id].dataUrl}
                                  download={mediaByMessageId[msg.id].filename || msg.filename || "media"}
                                  className="text-xs text-blue-400 underline"
                                >
                                  Download {mediaByMessageId[msg.id].filename || msg.filename || "file"}
                                </a>
                              )
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void loadMessageMedia(msg.id);
                                }}
                                className="rounded-md border border-zinc-700/60 bg-zinc-800/70 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700/70"
                              >
                                {messageMediaLoadingRef.current.has(msg.id)
                                  ? "Loading media..."
                                  : "Show media"}
                              </button>
                            )}
                          </div>
                        ) : null}

                        {/* Body */}
                        {msg.body ? (
                          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                        ) : null}

                        {/* Footer: time + ack */}
                        <div className="mt-1 flex items-center justify-end gap-1.5">
                          {msg.isStarred ? <span className="text-[10px]">⭐</span> : null}
                          <span className="text-[10px] text-zinc-500">
                            {formatTime(msg.timestamp)}
                          </span>
                          {msg.fromMe ? (
                            <span
                              className={`text-[10px] ${msg.ack >= 3 ? "text-blue-400" : "text-zinc-500"}`}
                              title={ACK_LABELS[msg.ack] ?? `ack:${msg.ack}`}
                            >
                              {ackIcon(msg.ack)}
                            </span>
                          ) : null}
                        </div>

                        {/* Quick action buttons on hover */}
                        <div className="absolute -top-3 right-1 hidden gap-0.5 rounded border border-zinc-700/60 bg-zinc-900/95 px-1 py-0.5 group-hover:flex">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setReplyTo(msg);
                              composerRef.current?.focus();
                            }}
                            className="px-1 text-[11px] text-zinc-400 hover:text-zinc-100"
                            title="Reply"
                          >
                            ↩
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const reaction = prompt("Emoji reaction (empty to remove):", "👍");
                              if (reaction !== null) performAction("react", msg.id, { reaction });
                            }}
                            className="px-1 text-[11px] text-zinc-400 hover:text-zinc-100"
                            title="React"
                          >
                            😊
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              performAction(msg.isStarred ? "unstar" : "star", msg.id);
                            }}
                            className="px-1 text-[11px] text-zinc-400 hover:text-zinc-100"
                            title="Star"
                          >
                            {msg.isStarred ? "★" : "☆"}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setContextMenu({
                                msg,
                                x: e.clientX,
                                y: e.clientY,
                              });
                            }}
                            className="px-1 text-[11px] text-zinc-400 hover:text-zinc-100"
                            title="More"
                          >
                            ⋮
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Context Menu */}
            {contextMenu ? (
              <div
                className="fixed z-50 min-w-36 rounded-lg border border-zinc-700/80 bg-zinc-900/95 py-1 shadow-xl backdrop-blur"
                style={{ left: contextMenu.x, top: contextMenu.y }}
              >
                <button
                  onClick={() => {
                    setReplyTo(contextMenu.msg);
                    setContextMenu(null);
                    composerRef.current?.focus();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800/80"
                >
                  ↩ Reply
                </button>
                <button
                  onClick={() => {
                    const targetChat = prompt("Forward to chat ID:");
                    if (targetChat) performAction("forward", contextMenu.msg.id, { chatId: targetChat });
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800/80"
                >
                  ↗ Forward
                </button>
                <button
                  onClick={() => {
                    const reaction = prompt("Emoji reaction:", "👍");
                    if (reaction !== null) performAction("react", contextMenu.msg.id, { reaction });
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800/80"
                >
                  😊 React
                </button>
                <button
                  onClick={() =>
                    performAction(contextMenu.msg.isStarred ? "unstar" : "star", contextMenu.msg.id)
                  }
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800/80"
                >
                  {contextMenu.msg.isStarred ? "★ Unstar" : "☆ Star"}
                </button>
                {contextMenu.msg.fromMe ? (
                  <>
                    <button
                      onClick={() => {
                        const newText = prompt("Edit message:", contextMenu.msg.body);
                        if (newText !== null) performAction("edit", contextMenu.msg.id, { content: newText });
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800/80"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => performAction("pin", contextMenu.msg.id)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800/80"
                    >
                      📌 Pin
                    </button>
                  </>
                ) : null}
                <hr className="my-1 border-zinc-700/60" />
                <button
                  onClick={() => {
                    if (confirm("Delete for everyone?")) {
                      performAction("delete", contextMenu.msg.id, { everyone: true });
                    }
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-400 hover:bg-zinc-800/80"
                >
                  🗑 Delete
                </button>
                {contextMenu.msg.hasMedia ? (
                  <button
                    onClick={() => performAction("downloadMedia", contextMenu.msg.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800/80"
                  >
                    ⬇ Download Media
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* Error bar */}
            {error ? (
              <div className="border-t border-red-500/30 bg-red-950/30 px-4 py-2 text-xs text-red-300">
                {error}
                <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-200">
                  ✕
                </button>
              </div>
            ) : null}

            {/* Reply indicator */}
            {replyTo ? (
              <div className="flex items-center justify-between border-t border-zinc-800/60 bg-zinc-800/40 px-4 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-emerald-400/80">
                    Replying to {replyTo.fromMe ? "yourself" : replyTo.contactName || replyTo.from}
                  </p>
                  <p className="truncate text-xs text-zinc-400">{replyTo.body || "[media]"}</p>
                </div>
                <button
                  onClick={() => setReplyTo(null)}
                  className="ml-2 flex-shrink-0 text-xs text-zinc-500 hover:text-zinc-300"
                >
                  ✕
                </button>
              </div>
            ) : null}

            {/* Media preview */}
            {showMediaPreview && mediaFile ? (
              <div className="flex items-center justify-between border-t border-zinc-800/60 bg-zinc-800/40 px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">📎</span>
                  <span className="text-xs text-zinc-300">{mediaFile.name}</span>
                  <span className="text-[10px] text-zinc-500">
                    ({(mediaFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
                <button
                  onClick={() => {
                    setMediaFile(null);
                    setShowMediaPreview(false);
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  ✕
                </button>
              </div>
            ) : null}

            {/* Composer */}
            <div className="border-t border-zinc-800/60 p-3">
              <div className="flex items-end gap-2">
                {/* Attachment button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-zinc-700/60 bg-zinc-800/80 text-zinc-400 transition-colors hover:bg-zinc-700/80 hover:text-zinc-100"
                  title="Attach file"
                >
                  📎
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setMediaFile(file);
                      setShowMediaPreview(true);
                    }
                    e.target.value = "";
                  }}
                />

                {/* Text input */}
                <textarea
                  ref={composerRef}
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  onKeyDown={handleComposerKey}
                  placeholder="Type a message..."
                  rows={1}
                  className="max-h-24 min-h-[2.25rem] flex-1 resize-none rounded-md border border-zinc-700/60 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-500"
                />

                {/* Send button */}
                <button
                  onClick={sendMessage}
                  disabled={sending || (!composerText.trim() && !mediaFile)}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-emerald-600/80 text-white transition-colors hover:bg-emerald-500/80 disabled:opacity-50"
                  title="Send"
                >
                  {sending ? "…" : "➤"}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
