"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  Fragment,
} from "react";
import {
  MdSend,
  MdAttachFile,
  MdClose,
  MdSearch,
  MdKeyboardArrowDown,
  MdMoreVert,
  MdReply,
  MdForward,
  MdDelete,
  MdEdit,
  MdStar,
  MdStarBorder,
  MdContentCopy,
  MdCheck,
  MdDoneAll,
  MdImage,
  MdVideocam,
  MdAudiotrack,
  MdInsertDriveFile,
  MdEmojiEmotions,
  MdArrowBack,
  MdPushPin,
  MdRefresh,
  MdArchive,
  MdUnarchive,
  MdVolumeOff,
  MdVolumeUp,
  MdDeleteForever,
  MdCleaningServices,
  MdVisibility,
  MdDownload,
  MdKeyboardVoice,
  MdLocationOn,
  MdContactPhone,
  MdPoll,
  MdPhotoLibrary,
  MdDescription,
} from "react-icons/md";
import {
  HiChatBubbleLeftRight,
  HiMagnifyingGlass,
  HiUserCircle,
} from "react-icons/hi2";
import { BsThreeDotsVertical, BsEmojiSmile } from "react-icons/bs";
import { IoCheckmarkDone, IoCheckmark } from "react-icons/io5";
import { FiPaperclip } from "react-icons/fi";
import { BiBlock } from "react-icons/bi";

/* ────────────────── Types ────────────────── */

interface Chat {
  id: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  timestamp: number; // milliseconds from API
  lastMessage?: { body: string; timestamp: number; fromMe: boolean };
  pinned?: boolean;
  archived?: boolean;
  muteExpiration?: number;
}

interface MessageReaction {
  emoji: string;
  senderId: string;
  timestamp?: number;
}

interface Message {
  id: string;
  body: string;
  timestamp: number; // milliseconds from API
  fromMe: boolean;
  type: string;
  hasMedia: boolean;
  hasQuotedMsg?: boolean;
  quotedMsgId?: string;
  isStarred?: boolean;
  ack?: number; // -1=err, 0=pending, 1=sent, 2=delivered, 3=read, 4=played
  author?: string;
  vCards?: string[];
  location?: { latitude: number; longitude: number; description?: string };
  links?: { link: string; isSuspicious: boolean }[];
  reactions?: MessageReaction[];
}

interface MediaData {
  mimetype: string;
  dataUrl: string;
  filename: string | null;
}

/* ────────────────── Hooks ────────────────── */

/** Lazy-load: only fires callback when element is visible */
function useInView(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
        observer.disconnect(); // only need first intersection
      }
    }, { rootMargin: "200px", ...options });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isInView };
}

// Global avatar cache so re-renders don't re-fetch
const avatarCache = new Map<string, string | null>();

/* ────────────────── Helpers ────────────────── */

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function groupMessagesByDate(messages: Message[]) {
  const groups: { date: string; messages: Message[] }[] = [];
  let currentDate = "";
  for (const msg of messages) {
    const date = formatDate(msg.timestamp);
    if (date !== currentDate) {
      currentDate = date;
      groups.push({ date, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }
  return groups;
}

function truncate(str: string, n: number) {
  return str.length > n ? str.slice(0, n) + "…" : str;
}

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"];

/* ────────────────── Sub-Components ────────────────── */

/** Ack / tick display */
function AckTicks({ ack }: { ack?: number }) {
  if (ack === undefined || ack < 0)
    return <MdCheck className="inline h-3.5 w-3.5 text-zinc-400" />;
  if (ack === 0)
    return <MdCheck className="inline h-3.5 w-3.5 text-zinc-500" />;
  if (ack === 1)
    return <MdCheck className="inline h-3.5 w-3.5 text-zinc-400" />;
  if (ack === 2)
    return <MdDoneAll className="inline h-3.5 w-3.5 text-zinc-400" />;
  return <MdDoneAll className="inline h-3.5 w-3.5 text-blue-400" />;
}

/** Message type icon */
function MessageTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "image":
    case "sticker":
      return <MdImage className="mr-1 inline h-4 w-4 text-zinc-400" />;
    case "video":
      return <MdVideocam className="mr-1 inline h-4 w-4 text-zinc-400" />;
    case "audio":
    case "ptt":
      return <MdAudiotrack className="mr-1 inline h-4 w-4 text-zinc-400" />;
    case "document":
      return (
        <MdInsertDriveFile className="mr-1 inline h-4 w-4 text-zinc-400" />
      );
    case "location":
    case "vcard":
    case "multi_vcard":
      return null;
    default:
      return null;
  }
}

/** Chat list avatar — lazy loaded with caching */
function ChatAvatar({
  chat,
  sessionId,
}: {
  chat: Chat;
  sessionId: string;
}) {
  const { ref, isInView } = useInView();
  const [url, setUrl] = useState<string | null>(() => avatarCache.get(`${sessionId}:${chat.id}`) ?? null);
  const [fetched, setFetched] = useState(() => avatarCache.has(`${sessionId}:${chat.id}`));

  useEffect(() => {
    if (!isInView || fetched) return;
    let ignore = false;
    const cacheKey = `${sessionId}:${chat.id}`;
    fetch(
      `/api/admin/chats/avatar?sessionId=${sessionId}&chatId=${chat.id}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (!ignore) {
          const pic = d?.data?.profilePicUrl || null;
          setUrl(pic);
          avatarCache.set(cacheKey, pic);
          setFetched(true);
        }
      })
      .catch(() => {
        if (!ignore) {
          avatarCache.set(`${sessionId}:${chat.id}`, null);
          setFetched(true);
        }
      });
    return () => { ignore = true; };
  }, [chat.id, sessionId, isInView, fetched]);

  if (url)
    return (
      <div ref={ref}>
        <img
          src={url}
          alt=""
          className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
        />
      </div>
    );

  return (
    <div ref={ref} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-700/40 text-sm font-bold text-emerald-300">
      {chat.name?.[0]?.toUpperCase() || "#"}
    </div>
  );
}

/* ────────────────── Inline Media Thumbnail ────────────────── */

// Global media cache
const mediaCache = new Map<string, MediaData>();

function InlineMediaThumb({
  msgId,
  sessionId,
  type,
  caption,
  onFullView,
}: {
  msgId: string;
  sessionId: string;
  type: string;
  caption?: string;
  onFullView: (media: MediaData) => void;
}) {
  const { ref, isInView } = useInView();
  const [media, setMedia] = useState<MediaData | null>(() => mediaCache.get(msgId) ?? null);
  const [loading, setLoading] = useState(!mediaCache.has(msgId));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isInView || media || error) return;
    let ignore = false;
    setLoading(true);
    setError(false);
    fetch(`/api/admin/messages/media?sessionId=${sessionId}&messageId=${msgId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!ignore && d?.data?.dataUrl) {
          mediaCache.set(msgId, d.data);
          setMedia(d.data);
        } else if (!ignore) {
          setError(true);
        }
      })
      .catch(() => {
        if (!ignore) setError(true);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => { ignore = true; };
  }, [msgId, sessionId, isInView, media, error]);

  const isImage = type === "image" || type === "sticker";
  const isVideo = type === "video";
  const isAudio = type === "audio" || type === "ptt";

  // Loading skeleton
  if (loading) {
    if (isImage || isVideo) {
      return (
        <div ref={ref} className={`relative overflow-hidden rounded-xl ${
          type === "sticker" ? "h-36 w-36" : "h-48 w-64 sm:w-72"
        } animate-pulse bg-zinc-700/50`}>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 rounded-full border-2 border-zinc-500 border-t-emerald-400 animate-spin" />
          </div>
        </div>
      );
    }
    if (isAudio) {
      return (
        <div ref={ref} className="flex h-14 w-56 animate-pulse items-center gap-3 rounded-xl bg-zinc-700/40 px-3">
          <div className="h-9 w-9 rounded-full bg-zinc-600/60" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2 w-full rounded bg-zinc-600/60" />
            <div className="h-2 w-2/3 rounded bg-zinc-600/40" />
          </div>
        </div>
      );
    }
    return (
      <div ref={ref} className="flex h-16 w-52 animate-pulse items-center gap-3 rounded-xl bg-zinc-700/40 px-3">
        <div className="h-10 w-10 rounded-lg bg-zinc-600/60" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 w-3/4 rounded bg-zinc-600/60" />
          <div className="h-2 w-1/2 rounded bg-zinc-600/40" />
        </div>
      </div>
    );
  }

  // Error fallback
  if (error || !media) {
    return (
      <div ref={ref} className="flex items-center gap-2.5 rounded-xl bg-zinc-700/30 px-3 py-2.5 text-zinc-400">
        {isImage && <MdImage className="h-5 w-5 flex-shrink-0" />}
        {isVideo && <MdVideocam className="h-5 w-5 flex-shrink-0" />}
        {isAudio && <MdKeyboardVoice className="h-5 w-5 flex-shrink-0" />}
        {!isImage && !isVideo && !isAudio && <MdInsertDriveFile className="h-5 w-5 flex-shrink-0" />}
        <span className="text-xs">Media unavailable</span>
      </div>
    );
  }

  // ── Image / Sticker ──
  if (isImage) {
    return (
      <button
        onClick={() => onFullView(media)}
        className="group/media relative block overflow-hidden rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
      >
        <img
          src={media.dataUrl}
          alt={caption || (type === "sticker" ? "Sticker" : "Photo")}
          className={`block object-cover transition-transform duration-300 group-hover/media:scale-[1.02] ${
            type === "sticker"
              ? "h-36 w-36 rounded-xl bg-transparent"
              : "max-h-72 w-full max-w-[18rem] sm:max-w-[20rem] rounded-xl"
          }`}
          loading="lazy"
        />
        {/* Overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 transition-colors group-hover/media:bg-black/20">
          <MdSearch className="h-8 w-8 text-white/0 drop-shadow-lg transition-all group-hover/media:text-white/90" />
        </div>
        {caption && (
          <p className="mt-1 px-0.5 text-sm leading-snug text-inherit">{caption}</p>
        )}
      </button>
    );
  }

  // ── Video ──
  if (isVideo) {
    return (
      <div className="relative overflow-hidden rounded-xl">
        <button
          onClick={() => onFullView(media)}
          className="group/media relative block overflow-hidden rounded-xl focus:outline-none"
        >
          <video
            src={media.dataUrl}
            className="block max-h-72 w-full max-w-[18rem] sm:max-w-[20rem] rounded-xl bg-black object-cover"
            preload="metadata"
            muted
          />
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/30 transition-colors group-hover/media:bg-black/40">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/25 backdrop-blur-sm transition-transform group-hover/media:scale-110">
              <div className="ml-1 h-0 w-0 border-y-[10px] border-l-[16px] border-y-transparent border-l-white" />
            </div>
          </div>
        </button>
        {caption && (
          <p className="mt-1 px-0.5 text-sm leading-snug text-inherit">{caption}</p>
        )}
      </div>
    );
  }

  // ── Audio / PTT ──
  if (isAudio) {
    return (
      <div className="w-56 sm:w-64">
        <div className="flex items-center gap-2.5 rounded-xl bg-zinc-700/30 p-2">
          <div className="relative flex-shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600/80">
              <MdKeyboardVoice className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <audio
              src={media.dataUrl}
              controls
              className="h-8 w-full [&::-webkit-media-controls-panel]:bg-transparent [&::-webkit-media-controls-current-time-display]:text-xs [&::-webkit-media-controls-time-remaining-display]:text-xs"
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Document / File ──
  return (
    <button
      onClick={() => onFullView(media)}
      className="group/doc flex w-56 items-center gap-3 rounded-xl border border-zinc-700/40 bg-zinc-700/20 p-3 transition-colors hover:bg-zinc-700/35 focus:outline-none"
    >
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-700/40">
        <MdInsertDriveFile className="h-6 w-6 text-emerald-400" />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium text-zinc-200">
          {media.filename || "Document"}
        </p>
        <p className="text-xs text-zinc-500">
          {media.mimetype.split("/")[1]?.toUpperCase() || "FILE"}
        </p>
      </div>
      <MdDownload className="h-4 w-4 flex-shrink-0 text-zinc-500 transition-colors group-hover/doc:text-emerald-400" />
    </button>
  );
}

/* ────────────────── Media Viewer (Pro) ────────────────── */

function MediaViewer({
  media,
  onClose,
}: {
  media: MediaData;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);

  const isImage = media.mimetype.startsWith("image/");
  const isVideo = media.mimetype.startsWith("video/");
  const isAudio = media.mimetype.startsWith("audio/");

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Pan handlers for zoomed images
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setDragging(true);
      setStartPos({ x: e.clientX - pos.x, y: e.clientY - pos.y });
    }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging && zoom > 1) {
      setPos({ x: e.clientX - startPos.x, y: e.clientY - startPos.y });
    }
  };
  const handleMouseUp = () => setDragging(false);

  const zoomIn = () => setZoom((z) => Math.min(z + 0.5, 4));
  const zoomOut = () => {
    setZoom((z) => {
      const nz = Math.max(z - 0.5, 1);
      if (nz === 1) setPos({ x: 0, y: 0 });
      return nz;
    });
  };
  const resetZoom = () => { setZoom(1); setPos({ x: 0, y: 0 }); };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = media.dataUrl;
    a.download = media.filename || "download";
    a.click();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
            {isImage && <MdImage className="h-5 w-5 text-white" />}
            {isVideo && <MdVideocam className="h-5 w-5 text-white" />}
            {isAudio && <MdAudiotrack className="h-5 w-5 text-white" />}
            {!isImage && !isVideo && !isAudio && <MdInsertDriveFile className="h-5 w-5 text-white" />}
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              {media.filename || (isImage ? "Image" : isVideo ? "Video" : isAudio ? "Audio" : "File")}
            </p>
            <p className="text-xs text-zinc-400">
              {media.mimetype}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isImage && (
            <>
              <button
                onClick={zoomOut}
                disabled={zoom <= 1}
                className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                title="Zoom out"
              >
                <MdSearch className="h-5 w-5" />
                <span className="sr-only">Zoom out</span>
              </button>
              <button
                onClick={resetZoom}
                className="rounded-lg px-2.5 py-1 text-xs font-mono text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={zoomIn}
                disabled={zoom >= 4}
                className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                title="Zoom in"
              >
                <MdSearch className="h-5 w-5" />
                <span className="sr-only">Zoom in</span>
              </button>
              <div className="mx-1 h-5 w-px bg-white/20" />
            </>
          )}
          <button
            onClick={handleDownload}
            className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            title="Download"
          >
            <MdDownload className="h-5 w-5" />
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            title="Close"
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 items-center justify-center overflow-hidden px-4 pb-6">
        {isImage && (
          <div
            className={`overflow-hidden ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
            onClick={() => { if (zoom === 1) zoomIn(); }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img
              src={media.dataUrl}
              alt={media.filename || "media"}
              className="max-h-[82vh] max-w-[92vw] rounded-lg object-contain shadow-2xl transition-transform duration-200 select-none"
              style={{
                transform: `scale(${zoom}) translate(${pos.x / zoom}px, ${pos.y / zoom}px)`,
              }}
              draggable={false}
            />
          </div>
        )}
        {isVideo && (
          <video
            src={media.dataUrl}
            controls
            autoPlay
            className="max-h-[82vh] max-w-[92vw] rounded-lg shadow-2xl"
          />
        )}
        {isAudio && (
          <div className="w-full max-w-md rounded-2xl bg-zinc-900/80 p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600/30">
                <MdAudiotrack className="h-10 w-10 text-emerald-400" />
              </div>
            </div>
            <p className="mb-4 text-center text-sm font-medium text-zinc-300">
              {media.filename || "Audio"}
            </p>
            <audio src={media.dataUrl} controls autoPlay className="w-full" />
          </div>
        )}
        {!isImage && !isVideo && !isAudio && (
          <div className="flex flex-col items-center gap-5 rounded-2xl bg-zinc-900/80 p-10 shadow-2xl">
            <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-emerald-700/30">
              <MdInsertDriveFile className="h-12 w-12 text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-zinc-200">
                {media.filename || "File"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{media.mimetype}</p>
            </div>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg transition-colors hover:bg-emerald-500"
            >
              <MdDownload className="h-5 w-5" /> Download
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────── Context Menu ────────────────── */

function MessageContextMenu({
  message,
  position,
  onAction,
  onClose,
}: {
  message: Message;
  position: { x: number; y: number };
  onAction: (action: string, msg: Message) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const items = [
    { icon: MdReply, label: "Reply", action: "reply" },
    { icon: MdForward, label: "Forward", action: "forward" },
    { icon: MdContentCopy, label: "Copy", action: "copy" },
    {
      icon: message.isStarred ? MdStar : MdStarBorder,
      label: message.isStarred ? "Unstar" : "Star",
      action: message.isStarred ? "unstar" : "star",
    },
    { icon: MdEmojiEmotions, label: "React", action: "react" },
    ...(message.fromMe
      ? [{ icon: MdEdit, label: "Edit", action: "edit" }]
      : []),
    {
      icon: MdDelete,
      label: "Delete",
      action: "delete",
      danger: true,
    },
    ...(message.hasMedia
      ? [{ icon: MdDownload, label: "Download Media", action: "downloadMedia" }]
      : []),
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] overflow-hidden rounded-xl border border-zinc-700/60 bg-zinc-800/95 shadow-2xl backdrop-blur-md"
      style={{ top: position.y, left: position.x }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.action}
            onClick={() => {
              onAction(item.action, message);
              onClose();
            }}
            className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors ${
              item.danger
                ? "text-red-400 hover:bg-red-900/30"
                : "text-zinc-200 hover:bg-zinc-700/60"
            }`}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/* ────────────────── Emoji Picker (Quick) ────────────────── */

function EmojiPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 left-0 flex gap-1 rounded-xl border border-zinc-700/50 bg-zinc-800/95 p-2 shadow-xl backdrop-blur-md"
    >
      {EMOJIS.map((e) => (
        <button
          key={e}
          onClick={() => onSelect(e)}
          className="rounded-lg p-1.5 text-xl hover:bg-zinc-700/60 transition-colors"
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/* ────────────────── Chat Action Bar ────────────────── */

function ChatActionBar({
  sessionId,
  chatId,
  chat,
  onRefresh,
}: {
  sessionId: string;
  chatId: string;
  chat: Chat | null;
  onRefresh: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const doAction = async (action: string) => {
    setLoading(true);
    try {
      await fetch("/api/admin/chats/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, chatId, action }),
      });
      onRefresh();
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const actions = [
    { icon: MdVisibility, label: "Mark Read", action: "sendSeen" },
    {
      icon: chat?.archived ? MdUnarchive : MdArchive,
      label: chat?.archived ? "Unarchive" : "Archive",
      action: chat?.archived ? "unarchive" : "archive",
    },
    {
      icon: chat?.muteExpiration ? MdVolumeUp : MdVolumeOff,
      label: chat?.muteExpiration ? "Unmute" : "Mute",
      action: chat?.muteExpiration ? "unmute" : "mute",
    },
    {
      icon: chat?.pinned ? MdPushPin : MdPushPin,
      label: chat?.pinned ? "Unpin" : "Pin",
      action: chat?.pinned ? "unpin" : "pin",
    },
    {
      icon: MdCleaningServices,
      label: "Clear Messages",
      action: "clearMessages",
    },
    { icon: MdDeleteForever, label: "Delete Chat", action: "delete" },
  ];

  return (
    <div className="flex flex-wrap gap-1 border-b border-zinc-700/40 bg-zinc-800/50 px-3 py-2">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <button
            key={a.action}
            onClick={() => doAction(a.action)}
            disabled={loading}
            title={a.label}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-700/50 hover:text-zinc-200 disabled:opacity-40"
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────── Message Bubble ─────────────────── */

function MessageBubble({
  message,
  sessionId,
  onContextMenu,
  onMediaView,
  onReact,
}: {
  message: Message;
  sessionId: string;
  onContextMenu: (e: React.MouseEvent, msg: Message) => void;
  onMediaView: (media: MediaData) => void;
  onReact: (msgId: string, emoji: string) => void;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const fromMe = message.fromMe;
  const senderName = message.author || "";
  const hasInlineMedia = message.hasMedia && ["image", "sticker", "video", "audio", "ptt", "document"].includes(message.type);

  const renderBody = () => {
    // If message has media, show professional inline thumbnail
    if (hasInlineMedia) {
      return (
        <InlineMediaThumb
          msgId={message.id}
          sessionId={sessionId}
          type={message.type}
          caption={message.type !== "document" ? message.body : undefined}
          onFullView={onMediaView}
        />
      );
    }

    if (message.type === "location" && message.location) {
      const { latitude, longitude, description } = message.location;
      return (
        <a
          href={`https://maps.google.com/?q=${latitude},${longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group/loc block overflow-hidden rounded-xl"
        >
          <div className="relative h-36 w-56 sm:w-64 overflow-hidden rounded-xl bg-zinc-700/40">
            <img
              src={`https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=15&size=400x250&markers=color:green%7C${latitude},${longitude}&key=`}
              alt="Location"
              className="h-full w-full object-cover opacity-80 transition-opacity group-hover/loc:opacity-100"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-emerald-900/30">
              <span className="text-3xl drop-shadow-lg">📍</span>
            </div>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
            <span className="text-xs font-medium text-emerald-400">
              {description || "View location"}
            </span>
            <MdSearch className="h-3.5 w-3.5 text-emerald-400/60" />
          </div>
        </a>
      );
    }

    if (message.type === "vcard" || message.type === "multi_vcard") {
      // Try to parse vCard name
      const vcardName = message.vCards?.[0]?.match(/FN:(.*)/)?.[1] || "Contact";
      return (
        <div className="flex w-52 items-center gap-3 rounded-xl border border-zinc-700/40 bg-zinc-700/20 p-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-700/40">
            <HiUserCircle className="h-6 w-6 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-200">{vcardName}</p>
            <p className="text-[11px] text-zinc-500">Contact card</p>
          </div>
        </div>
      );
    }

    // linkify text
    if (message.body) {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      if (urlRegex.test(message.body)) {
        const parts = message.body.split(/(https?:\/\/[^\s]+)/g);
        return (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {parts.map((part, i) =>
              /^https?:\/\//.test(part) ? (
                <a
                  key={i}
                  href={part}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline hover:text-blue-300"
                >
                  {part}
                </a>
              ) : (
                <Fragment key={i}>{part}</Fragment>
              )
            )}
          </p>
        );
      }
    }

    return (
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        {message.body}
      </p>
    );
  };

  // Group reactions by emoji for display
  const groupedReactions = useMemo(() => {
    if (!message.reactions?.length) return [];
    const map = new Map<string, number>();
    for (const r of message.reactions) {
      map.set(r.emoji, (map.get(r.emoji) || 0) + 1);
    }
    return Array.from(map.entries()).map(([emoji, count]) => ({ emoji, count }));
  }, [message.reactions]);

  // Media messages get a wider, padding-free bubble for images/video
  const isVisualMedia = hasInlineMedia && ["image", "sticker", "video"].includes(message.type);

  return (
    <div
      className={`group flex ${fromMe ? "justify-end" : "justify-start"} mb-1.5 px-3`}
      onContextMenu={(e) => onContextMenu(e, message)}
    >
      <div className="flex flex-col max-w-[80%]">
        <div
          className={`relative rounded-2xl shadow-sm ${
            fromMe
              ? `rounded-br-md bg-emerald-900/60 text-emerald-50 ${isVisualMedia ? "p-1.5" : "px-3 py-2"}`
              : `rounded-bl-md bg-zinc-800/80 text-zinc-100 ${isVisualMedia ? "p-1.5" : "px-3 py-2"}`
          }`}
        >
        {/* Quoted message */}
        {message.hasQuotedMsg && message.quotedMsgId && (
          <div className={`mb-1.5 rounded-lg border-l-2 border-emerald-500/60 bg-zinc-900/40 px-2.5 py-1.5 text-xs text-zinc-400 ${isVisualMedia ? "mx-1.5 mt-1" : ""}`}>
            Quoted message
          </div>
        )}

        {/* Sender name for groups */}
        {!fromMe && senderName && (
          <p className={`mb-0.5 text-xs font-semibold text-emerald-400 ${isVisualMedia ? "px-1.5" : ""}`}>
            {senderName}
          </p>
        )}

        {/* Message body */}
        {renderBody()}

        {/* Timestamp & ack — overlaid on visual media */}
        <div
          className={`flex items-center gap-1 text-[10px] ${
            isVisualMedia
              ? `absolute bottom-2 right-2 rounded-full px-2 py-0.5 ${fromMe ? "bg-black/40 text-white/80" : "bg-black/40 text-white/80"}`
              : `mt-0.5 ${fromMe ? "justify-end text-emerald-300/60" : "text-zinc-500"}`
          }`}
        >
          {message.isStarred && <MdStar className="h-3 w-3 text-yellow-400" />}
          <span>{formatTime(message.timestamp)}</span>
          {fromMe && <AckTicks ack={message.ack} />}
        </div>

        {/* Hover actions */}
        <div className="absolute -top-3 right-1 flex opacity-0 transition-opacity group-hover:opacity-100 z-10">
          <button
            onClick={(e) => onContextMenu(e, message)}
            className="rounded-full bg-zinc-700/90 p-1 text-zinc-300 shadow-md hover:bg-zinc-600"
          >
            <MdKeyboardArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Quick react */}
        <div className="absolute -bottom-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 z-10">
          <button
            onClick={() => setShowReactions(!showReactions)}
            className="rounded-full bg-zinc-700/90 p-1 shadow-md text-zinc-300 hover:bg-zinc-600"
          >
            <BsEmojiSmile className="h-3 w-3" />
          </button>
          {showReactions && (
            <div className="absolute -top-10 right-0 flex gap-0.5 rounded-full bg-zinc-800/95 px-1.5 py-1 shadow-lg border border-zinc-700/60">
              {EMOJIS.slice(0, 6).map((em) => (
                <button
                  key={em}
                  onClick={() => {
                    onReact(message.id, em);
                    setShowReactions(false);
                  }}
                  className="text-sm hover:scale-125 transition-transform px-0.5"
                >
                  {em}
                </button>
              ))}
            </div>
          )}
        </div>
        </div>

        {/* Reactions display — below the bubble, in normal flow */}
        {groupedReactions.length > 0 && (
          <div className={`flex gap-0.5 -mt-1.5 ${fromMe ? "justify-end pr-2" : "pl-2"}`}>
            {groupedReactions.map(({ emoji, count }) => (
              <span
                key={emoji}
                className="inline-flex items-center gap-0.5 rounded-full border border-zinc-700/60 bg-zinc-800/95 px-1.5 py-0.5 text-xs shadow-sm cursor-pointer hover:bg-zinc-700/80 transition-colors"
                onClick={() => onReact(message.id, emoji)}
                title={`${emoji} ${count}`}
              >
                <span className="text-[11px]">{emoji}</span>
                {count > 1 && <span className="text-[10px] text-zinc-400">{count}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── Chat List Item ─────────────────── */

function ChatListItem({
  chat,
  isActive,
  sessionId,
  onSelect,
}: {
  chat: Chat;
  isActive: boolean;
  sessionId: string;
  onSelect: (chat: Chat) => void;
}) {
  return (
    <button
      onClick={() => onSelect(chat)}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
        isActive
          ? "bg-emerald-900/30 border-l-2 border-emerald-400"
          : "border-l-2 border-transparent hover:bg-zinc-800/50"
      }`}
    >
      <ChatAvatar chat={chat} sessionId={sessionId} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <span
            className={`truncate text-sm font-medium ${
              isActive ? "text-emerald-300" : "text-zinc-200"
            }`}
          >
            {chat.name || chat.id}
          </span>
          <span className="flex-shrink-0 text-[10px] text-zinc-500">
            {chat.timestamp ? formatTime(chat.timestamp) : ""}
          </span>
        </div>
        <div className="flex items-center justify-between gap-1">
          <p className="flex items-center gap-1 truncate text-xs text-zinc-400">
            {chat.lastMessage?.fromMe && <AckTicks ack={3} />}
            {chat.lastMessage?.body
              ? truncate(chat.lastMessage.body, 35)
              : ""}
          </p>
          <div className="flex items-center gap-1">
            {chat.pinned && (
              <MdPushPin className="h-3 w-3 text-emerald-400/60" />
            )}
            {chat.archived && (
              <MdArchive className="h-3 w-3 text-zinc-500" />
            )}
            {chat.unreadCount > 0 && (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════
   ██  MAIN CHAT PANEL COMPONENT
   ═══════════════════════════════════════════════════ */

export function ChatPanel({ sessionId }: { sessionId: string }) {
  /* ── State ── */
  const [chats, setChats] = useState<Chat[]>([]);
  const [filteredChats, setFilteredChats] = useState<Chat[]>([]);
  const [chatSearch, setChatSearch] = useState("");
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgText, setMsgText] = useState("");
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [msgSearch, setMsgSearch] = useState("");
  const CHATS_PER_PAGE = 30;
  const [visibleChatsCount, setVisibleChatsCount] = useState(CHATS_PER_PAGE);
  const chatListRef = useRef<HTMLDivElement>(null);
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    msg: Message;
    pos: { x: number; y: number };
  } | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editMessage, setEditMessage] = useState<Message | null>(null);
  const [showChatActions, setShowChatActions] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<MediaData | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [forwardTarget, setForwardTarget] = useState<{
    msgId: string;
  } | null>(null);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [locationLat, setLocationLat] = useState("");
  const [locationLng, setLocationLng] = useState("");
  const [locationDesc, setLocationDesc] = useState("");
  const [contactId, setContactId] = useState("");

  const messengerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Fetch chats ── */
  const fetchChats = useCallback(async () => {
    setLoadingChats(true);
    try {
      const res = await fetch(`/api/admin/chats?sessionId=${sessionId}`);
      const data = await res.json();
      const list: Chat[] = data?.data?.chats || [];
      list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setChats(list);
      setFilteredChats(list);
    } catch {
      /* ignore */
    } finally {
      setLoadingChats(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  /* ── Filter chats by search ── */
  useEffect(() => {
    if (!chatSearch.trim()) {
      setFilteredChats(chats);
    } else {
      const q = chatSearch.toLowerCase();
      setFilteredChats(
        chats.filter(
          (c) =>
            c.name?.toLowerCase().includes(q) ||
            c.id.toLowerCase().includes(q)
        )
      );
    }
    setVisibleChatsCount(CHATS_PER_PAGE);
  }, [chatSearch, chats]);

  /* ── Categorized chats: pinned / regular / archived ── */
  const { pinnedChats, regularChats, archivedChats, archivedCount } = useMemo(() => {
    const pinned: Chat[] = [];
    const regular: Chat[] = [];
    const archived: Chat[] = [];
    for (const c of filteredChats) {
      if (c.archived) archived.push(c);
      else if (c.pinned) pinned.push(c);
      else regular.push(c);
    }
    return {
      pinnedChats: pinned,
      regularChats: regular,
      archivedChats: archived,
      archivedCount: archived.length,
    };
  }, [filteredChats]);

  /* ── Visible (paginated) regular chats ── */
  const visibleRegularChats = useMemo(
    () => regularChats.slice(0, visibleChatsCount),
    [regularChats, visibleChatsCount]
  );

  /* ── Load more chats on scroll ── */
  const handleChatListScroll = useCallback(() => {
    const el = chatListRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      setVisibleChatsCount((prev) => Math.min(prev + CHATS_PER_PAGE, regularChats.length));
    }
  }, [regularChats.length]);

  /* ── Fetch messages ── */
  const fetchMessages = useCallback(
    async (chatId: string) => {
      setLoadingMsgs(true);
      try {
        const res = await fetch(
          `/api/admin/chats/messages?sessionId=${sessionId}&chatId=${chatId}&limit=50`
        );
        const data = await res.json();
        setMessages(data?.data?.messages || []);
      } catch {
        /* ignore */
      } finally {
        setLoadingMsgs(false);
      }
    },
    [sessionId]
  );

  /* ── Select chat ── */
  const openChat = useCallback(
    (chat: Chat) => {
      setSelectedChat(chat);
      setMessages([]);
      setReplyTo(null);
      setEditMessage(null);
      setShowChatActions(false);
      setShowMsgSearch(false);
      setMsgSearch("");
      setContextMenu(null);
      fetchMessages(chat.id);
    },
    [fetchMessages]
  );

  /* ── Scroll to bottom ── */
  useEffect(() => {
    if (messengerRef.current && messages.length > 0) {
      messengerRef.current.scrollTop = messengerRef.current.scrollHeight;
    }
  }, [messages]);

  /* ── Send message ── */
  const handleSend = async () => {
    if ((!msgText.trim() && !attachFile) || !selectedChat) return;
    setSending(true);
    try {
      if (attachFile) {
        // Send media
        const formData = new FormData();
        formData.append("sessionId", sessionId);
        formData.append("chatId", selectedChat.id);
        formData.append("file", attachFile);
        if (msgText.trim()) formData.append("caption", msgText.trim());
        await fetch("/api/admin/messages/media", {
          method: "POST",
          body: formData,
        });
        setAttachFile(null);
      } else if (editMessage) {
        // Edit existing message
        await fetch("/api/admin/messages/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            messageId: editMessage.id,
            action: "edit",
            content: msgText.trim(),
          }),
        });
        setEditMessage(null);
      } else {
        // Send text
        const payload: Record<string, string> = {
          sessionId,
          chatId: selectedChat.id,
          text: msgText.trim(),
        };
        if (replyTo) {
          payload.quotedMessageId = replyTo.id;
        }
        await fetch("/api/admin/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setReplyTo(null);
      }

      setMsgText("");
      // refresh messages
      setTimeout(() => fetchMessages(selectedChat.id), 500);
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  /* ── Send location ── */
  const handleSendLocation = async () => {
    if (!selectedChat) return;
    const lat = parseFloat(locationLat);
    const lng = parseFloat(locationLng);
    if (isNaN(lat) || isNaN(lng)) return;
    setSending(true);
    try {
      await fetch("/api/admin/messages/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          chatId: selectedChat.id,
          latitude: lat,
          longitude: lng,
          description: locationDesc.trim() || undefined,
        }),
      });
      setLocationLat("");
      setLocationLng("");
      setLocationDesc("");
      setShowLocationModal(false);
      setTimeout(() => fetchMessages(selectedChat.id), 500);
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  /* ── Send contact card ── */
  const handleSendContact = async () => {
    if (!selectedChat || !contactId.trim()) return;
    setSending(true);
    try {
      await fetch("/api/admin/messages/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          chatId: selectedChat.id,
          contactId: contactId.trim(),
        }),
      });
      setContactId("");
      setShowContactModal(false);
      setTimeout(() => fetchMessages(selectedChat.id), 500);
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  /* ── Handle context menu action ── */
  const handleMsgAction = async (action: string, msg: Message) => {
    if (action === "copy") {
      navigator.clipboard.writeText(msg.body);
      return;
    }
    if (action === "reply") {
      setReplyTo(msg);
      setEditMessage(null);
      inputRef.current?.focus();
      return;
    }
    if (action === "edit") {
      setEditMessage(msg);
      setReplyTo(null);
      setMsgText(msg.body);
      inputRef.current?.focus();
      return;
    }
    if (action === "react") {
      // toggle emoji picker is handled inline
      return;
    }
    if (action === "forward") {
      setForwardTarget({ msgId: msg.id });
      return;
    }
    if (action === "downloadMedia") {
      await handleDownloadMedia(msg.id);
      return;
    }

    // API actions: delete, star, unstar, pin, unpin
    try {
      await fetch("/api/admin/messages/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          messageId: msg.id,
          action,
          everyone: action === "delete" ? true : undefined,
        }),
      });
      if (selectedChat) {
        setTimeout(
          () => fetchMessages(selectedChat.id),
          400
        );
      }
    } catch {
      /* ignore */
    }
  };

  /* ── Handle react ── */
  const handleReact = async (msgId: string, emoji: string) => {
    try {
      await fetch("/api/admin/messages/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          messageId: msgId,
          action: "react",
          reaction: emoji,
        }),
      });
    } catch {
      /* ignore */
    }
  };

  /* ── Handle forward ── */
  const handleForward = async (targetChatId: string) => {
    if (!forwardTarget) return;
    try {
      await fetch("/api/admin/messages/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          messageId: forwardTarget.msgId,
          action: "forward",
          chatId: targetChatId,
        }),
      });
    } catch {
      /* ignore */
    } finally {
      setForwardTarget(null);
    }
  };

  /* ── Download media from context menu ── */
  const handleDownloadMedia = async (msgId: string) => {
    try {
      const res = await fetch(
        `/api/admin/messages/media?sessionId=${sessionId}&messageId=${msgId}`
      );
      const data = await res.json();
      if (data?.data?.dataUrl) {
        setMediaViewer(data.data);
      }
    } catch {
      /* ignore */
    }
  };

  /* ── File upload trigger ── */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachFile(file);
    }
  };

  /* ── Filtered messages ── */
  const filteredMsgs = useMemo(() => {
    if (!msgSearch.trim()) return messages;
    const q = msgSearch.toLowerCase();
    return messages.filter((m) => m.body?.toLowerCase().includes(q));
  }, [messages, msgSearch]);

  /* ── Grouped messages by date ── */
  const groupedMessages = useMemo(
    () => groupMessagesByDate(filteredMsgs),
    [filteredMsgs]
  );

  /* ── Handle keydown ── */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ────────────── RENDER ────────────── */

  return (
    <div className="flex h-[700px] overflow-hidden rounded-2xl border border-zinc-700/50 bg-zinc-900/70 shadow-xl">
      {/* ═══ LEFT: Chat List ═══ */}
      <div
        className={`flex w-80 flex-shrink-0 flex-col border-r border-zinc-700/40 bg-zinc-900/50 ${
          selectedChat ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-700/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <HiChatBubbleLeftRight className="h-5 w-5 text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Chats</h3>
            {chats.length > 0 && (
              <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                {pinnedChats.length + regularChats.length}
              </span>
            )}
          </div>
          <button
            onClick={fetchChats}
            disabled={loadingChats}
            title="Refresh chats"
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-700/50 hover:text-zinc-200 disabled:opacity-40"
          >
            <MdRefresh
              className={`h-4.5 w-4.5 ${loadingChats ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 rounded-xl bg-zinc-800/60 px-3 py-2">
            <HiMagnifyingGlass className="h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder="Search chats..."
              className="w-full bg-transparent text-sm text-zinc-200 placeholder-zinc-500 outline-none"
            />
            {chatSearch && (
              <button onClick={() => setChatSearch("")}>
                <MdClose className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300" />
              </button>
            )}
          </div>
        </div>

        {/* Chat List */}
        <div
          ref={chatListRef}
          onScroll={handleChatListScroll}
          className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-700"
        >
          {loadingChats && chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
              <MdRefresh className="mb-2 h-6 w-6 animate-spin" />
              <span className="text-sm">Loading chats…</span>
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="py-16 text-center text-sm text-zinc-500">
              {chatSearch ? "No matching chats" : "No chats found"}
            </div>
          ) : (
            <>
            {/* ── Pinned Chats ── */}
            {pinnedChats.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-4 py-1.5 bg-zinc-800/30">
                  <MdPushPin className="h-3 w-3 text-emerald-400/70" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70">
                    Pinned
                  </span>
                  <span className="text-[10px] text-zinc-500">{pinnedChats.length}</span>
                </div>
                {pinnedChats.map((chat) => {
                  const isActive = selectedChat?.id === chat.id;
                  return (
                    <ChatListItem
                      key={chat.id}
                      chat={chat}
                      isActive={isActive}
                      sessionId={sessionId}
                      onSelect={openChat}
                    />
                  );
                })}
              </>
            )}

            {/* ── Regular Chats ── */}
            {pinnedChats.length > 0 && regularChats.length > 0 && (
              <div className="flex items-center gap-2 px-4 py-1.5 bg-zinc-800/30">
                <HiChatBubbleLeftRight className="h-3 w-3 text-zinc-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  All Chats
                </span>
                <span className="text-[10px] text-zinc-600">{regularChats.length}</span>
              </div>
            )}
            {visibleRegularChats.map((chat) => {
              const isActive = selectedChat?.id === chat.id;
              return (
                <ChatListItem
                  key={chat.id}
                  chat={chat}
                  isActive={isActive}
                  sessionId={sessionId}
                  onSelect={openChat}
                />
              );
            })}
            {visibleChatsCount < regularChats.length && (
              <div className="py-3 text-center">
                <span className="text-xs text-zinc-500">
                  Showing {visibleChatsCount} of {regularChats.length} — scroll for more
                </span>
              </div>
            )}

            {/* ── Archived Chats ── */}
            {archivedCount > 0 && (
              <>
                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className="flex w-full items-center gap-2 border-t border-zinc-700/40 px-4 py-2.5 text-left transition-colors hover:bg-zinc-800/40"
                >
                  <MdArchive className="h-4 w-4 text-zinc-500" />
                  <span className="text-xs font-medium text-zinc-400">Archived</span>
                  <span className="rounded-full bg-zinc-700/60 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                    {archivedCount}
                  </span>
                  <MdKeyboardArrowDown
                    className={`ml-auto h-4 w-4 text-zinc-500 transition-transform ${showArchived ? "rotate-180" : ""}`}
                  />
                </button>
                {showArchived && (
                  <div className="border-t border-zinc-700/20 bg-zinc-900/40">
                    {archivedChats.map((chat) => {
                      const isActive = selectedChat?.id === chat.id;
                      return (
                        <ChatListItem
                          key={chat.id}
                          chat={chat}
                          isActive={isActive}
                          sessionId={sessionId}
                          onSelect={openChat}
                        />
                      );
                    })}
                  </div>
                )}
              </>
            )}
            </>
          )}
        </div>
      </div>

      {/* ═══ RIGHT: Message Panel ═══ */}
      <div
        className={`flex flex-1 flex-col ${
          selectedChat ? "flex" : "hidden md:flex"
        }`}
      >
        {!selectedChat ? (
          /* No chat selected placeholder */
          <div className="flex flex-1 flex-col items-center justify-center text-zinc-500">
            <HiChatBubbleLeftRight className="mb-3 h-16 w-16 text-zinc-700" />
            <p className="text-lg font-medium text-zinc-400">
              Select a chat to start
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              Choose a conversation from the left
            </p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="flex items-center justify-between border-b border-zinc-700/40 bg-zinc-800/40 px-4 py-2.5">
              <div className="flex items-center gap-3">
                {/* Back button on mobile */}
                <button
                  onClick={() => setSelectedChat(null)}
                  className="md:hidden rounded-lg p-1 text-zinc-400 hover:text-zinc-200"
                >
                  <MdArrowBack className="h-5 w-5" />
                </button>
                <ChatAvatar
                  chat={selectedChat}
                  sessionId={sessionId}
                />
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    {selectedChat.name || selectedChat.id}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {selectedChat.isGroup ? "Group" : "Private"} •{" "}
                    {selectedChat.id}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowMsgSearch(!showMsgSearch)}
                  title="Search messages"
                  className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200"
                >
                  <MdSearch className="h-4.5 w-4.5" />
                </button>
                <button
                  onClick={() =>
                    fetchMessages(selectedChat.id)
                  }
                  title="Refresh"
                  className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200"
                >
                  <MdRefresh
                    className={`h-4.5 w-4.5 ${
                      loadingMsgs ? "animate-spin" : ""
                    }`}
                  />
                </button>
                <button
                  onClick={() => setShowChatActions(!showChatActions)}
                  title="Chat actions"
                  className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200"
                >
                  <BsThreeDotsVertical className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Chat Actions Bar */}
            {showChatActions && (
              <ChatActionBar
                sessionId={sessionId}
                chatId={selectedChat.id}
                chat={selectedChat}
                onRefresh={() => {
                  fetchChats();
                  fetchMessages(selectedChat.id);
                }}
              />
            )}

            {/* Message Search */}
            {showMsgSearch && (
              <div className="flex items-center gap-2 border-b border-zinc-700/40 bg-zinc-800/30 px-4 py-2">
                <MdSearch className="h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  value={msgSearch}
                  onChange={(e) => setMsgSearch(e.target.value)}
                  placeholder="Search in messages..."
                  className="w-full bg-transparent text-sm text-zinc-200 placeholder-zinc-500 outline-none"
                  autoFocus
                />
                <span className="text-xs text-zinc-500">
                  {filteredMsgs.length}/{messages.length}
                </span>
                <button
                  onClick={() => {
                    setShowMsgSearch(false);
                    setMsgSearch("");
                  }}
                >
                  <MdClose className="h-4 w-4 text-zinc-500 hover:text-zinc-300" />
                </button>
              </div>
            )}

            {/* Forward target picker */}
            {forwardTarget && (
              <div className="border-b border-zinc-700/40 bg-zinc-800/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-emerald-400">
                    <MdForward className="mr-1 inline h-3.5 w-3.5" />
                    Forward to:
                  </span>
                  <button onClick={() => setForwardTarget(null)}>
                    <MdClose className="h-4 w-4 text-zinc-500 hover:text-zinc-300" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {chats.slice(0, 20).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleForward(c.id)}
                      className="rounded-lg bg-zinc-700/50 px-2.5 py-1 text-xs text-zinc-300 hover:bg-emerald-900/40 hover:text-emerald-300 transition-colors"
                    >
                      {truncate(c.name || c.id, 20)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            <div
              ref={messengerRef}
              className="flex-1 overflow-y-auto bg-zinc-950/30 py-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-700"
            >
              {loadingMsgs ? (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                  <MdRefresh className="mb-2 h-6 w-6 animate-spin" />
                  <span className="text-sm">Loading messages…</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                  <HiChatBubbleLeftRight className="mb-2 h-10 w-10 text-zinc-700" />
                  <span className="text-sm">No messages yet</span>
                </div>
              ) : (
                groupedMessages.map((group) => (
                  <div key={group.date}>
                    {/* Date separator */}
                    <div className="my-3 flex items-center justify-center">
                      <span className="rounded-lg bg-zinc-800/80 px-3 py-1 text-[11px] font-medium text-zinc-400 shadow-sm">
                        {group.date}
                      </span>
                    </div>
                    {group.messages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        sessionId={sessionId}
                        onContextMenu={(e, m) => {
                          e.preventDefault();
                          setContextMenu({
                            msg: m,
                            pos: { x: e.clientX, y: e.clientY },
                          });
                        }}
                        onMediaView={(media) => setMediaViewer(media)}
                        onReact={handleReact}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Reply / Edit bar */}
            {(replyTo || editMessage) && (
              <div className="flex items-center gap-2 border-t border-zinc-700/40 bg-zinc-800/50 px-4 py-2">
                <div className="flex-1 rounded-lg border-l-2 border-emerald-500/60 bg-zinc-900/50 px-3 py-1.5">
                  <p className="text-[10px] font-semibold text-emerald-400">
                    {editMessage ? "Editing" : "Replying to"}
                  </p>
                  <p className="truncate text-xs text-zinc-400">
                    {truncate(
                      (editMessage || replyTo)?.body || "",
                      60
                    )}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setReplyTo(null);
                    setEditMessage(null);
                    setMsgText("");
                  }}
                >
                  <MdClose className="h-5 w-5 text-zinc-500 hover:text-zinc-300" />
                </button>
              </div>
            )}

            {/* File preview */}
            {attachFile && (
              <div className="flex items-center gap-2 border-t border-zinc-700/40 bg-zinc-800/50 px-4 py-2">
                <MdAttachFile className="h-4 w-4 text-emerald-400" />
                <span className="flex-1 truncate text-xs text-zinc-300">
                  {attachFile.name}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {(attachFile.size / 1024).toFixed(1)} KB
                </span>
                <button onClick={() => setAttachFile(null)}>
                  <MdClose className="h-4 w-4 text-zinc-500 hover:text-zinc-300" />
                </button>
              </div>
            )}

            {/* Input */}
            <div className="flex items-end gap-2 border-t border-zinc-700/40 bg-zinc-800/40 px-4 py-3">
              {/* Emoji */}
              <div className="relative">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200"
                >
                  <MdEmojiEmotions className="h-5 w-5" />
                </button>
                {showEmojiPicker && (
                  <EmojiPicker
                    onSelect={(emoji) => {
                      setMsgText((prev) => prev + emoji);
                      setShowEmojiPicker(false);
                      inputRef.current?.focus();
                    }}
                    onClose={() => setShowEmojiPicker(false)}
                  />
                )}
              </div>

              {/* Attach menu */}
              <div className="relative">
                <button
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200"
                >
                  <FiPaperclip className={`h-5 w-5 transition-transform ${showAttachMenu ? "rotate-45" : ""}`} />
                </button>
                {showAttachMenu && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowAttachMenu(false)} />
                    <div className="absolute bottom-12 left-0 z-40 flex flex-col gap-1 rounded-xl border border-zinc-700/60 bg-zinc-800/95 p-2 shadow-xl backdrop-blur-sm min-w-[180px]">
                      <button
                        onClick={() => {
                          fileInputRef.current?.click();
                          setShowAttachMenu(false);
                        }}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700/60 hover:text-zinc-100 transition-colors"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-600/30">
                          <MdInsertDriveFile className="h-4 w-4 text-purple-400" />
                        </div>
                        Document
                      </button>
                      <button
                        onClick={() => {
                          fileInputRef.current?.setAttribute("accept", "image/*,video/*");
                          fileInputRef.current?.click();
                          setShowAttachMenu(false);
                          // Reset accept after selection
                          setTimeout(() => fileInputRef.current?.removeAttribute("accept"), 100);
                        }}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700/60 hover:text-zinc-100 transition-colors"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/30">
                          <MdPhotoLibrary className="h-4 w-4 text-blue-400" />
                        </div>
                        Photos & Videos
                      </button>
                      <button
                        onClick={() => {
                          setShowLocationModal(true);
                          setShowAttachMenu(false);
                        }}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700/60 hover:text-zinc-100 transition-colors"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600/30">
                          <MdLocationOn className="h-4 w-4 text-green-400" />
                        </div>
                        Location
                      </button>
                      <button
                        onClick={() => {
                          setShowContactModal(true);
                          setShowAttachMenu(false);
                        }}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700/60 hover:text-zinc-100 transition-colors"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-600/30">
                          <MdContactPhone className="h-4 w-4 text-orange-400" />
                        </div>
                        Contact
                      </button>
                    </div>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
              />

              {/* Text area */}
              <textarea
                ref={inputRef}
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  editMessage
                    ? "Edit message..."
                    : "Type a message..."
                }
                rows={1}
                className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl bg-zinc-800/60 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none ring-1 ring-zinc-700/50 focus:ring-emerald-500/50"
              />

              {/* Send */}
              <button
                onClick={handleSend}
                disabled={sending || (!msgText.trim() && !attachFile)}
                className="rounded-xl bg-emerald-600 p-2.5 text-white shadow-lg transition-all hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600"
              >
                <MdSend
                  className={`h-5 w-5 ${sending ? "animate-pulse" : ""}`}
                />
              </button>
            </div>
          </>
        )}
      </div>

      {/* ═══ Context Menu ═══ */}
      {contextMenu && (
        <MessageContextMenu
          message={contextMenu.msg}
          position={contextMenu.pos}
          onAction={handleMsgAction}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* ═══ Media Viewer ═══ */}
      {mediaViewer && (
        <MediaViewer
          media={mediaViewer}
          onClose={() => setMediaViewer(null)}
        />
      )}

      {/* ═══ Location Modal ═══ */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700/60 bg-zinc-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600/30">
                  <MdLocationOn className="h-5 w-5 text-green-400" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-100">Send Location</h3>
              </div>
              <button onClick={() => setShowLocationModal(false)}>
                <MdClose className="h-5 w-5 text-zinc-500 hover:text-zinc-300" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={locationLat}
                  onChange={(e) => setLocationLat(e.target.value)}
                  placeholder="35.6892"
                  className="w-full rounded-lg bg-zinc-800/60 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700/50 focus:ring-emerald-500/50 placeholder-zinc-600"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={locationLng}
                  onChange={(e) => setLocationLng(e.target.value)}
                  placeholder="51.3890"
                  className="w-full rounded-lg bg-zinc-800/60 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700/50 focus:ring-emerald-500/50 placeholder-zinc-600"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Description (optional)</label>
                <input
                  type="text"
                  value={locationDesc}
                  onChange={(e) => setLocationDesc(e.target.value)}
                  placeholder="Location name..."
                  className="w-full rounded-lg bg-zinc-800/60 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700/50 focus:ring-emerald-500/50 placeholder-zinc-600"
                />
              </div>
              <button
                onClick={handleSendLocation}
                disabled={sending || !locationLat || !locationLng}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:bg-emerald-500 disabled:opacity-40"
              >
                <MdSend className={`h-4 w-4 ${sending ? "animate-pulse" : ""}`} />
                Send Location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Contact Modal ═══ */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700/60 bg-zinc-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-600/30">
                  <MdContactPhone className="h-5 w-5 text-orange-400" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-100">Send Contact</h3>
              </div>
              <button onClick={() => setShowContactModal(false)}>
                <MdClose className="h-5 w-5 text-zinc-500 hover:text-zinc-300" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Contact Number (WhatsApp ID)</label>
                <input
                  type="text"
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  placeholder="989123456789@c.us or phone number"
                  className="w-full rounded-lg bg-zinc-800/60 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700/50 focus:ring-emerald-500/50 placeholder-zinc-600"
                />
                <p className="mt-1 text-[10px] text-zinc-500">
                  Enter a phone number or WhatsApp ID (e.g. 989123456789)
                </p>
              </div>
              <button
                onClick={handleSendContact}
                disabled={sending || !contactId.trim()}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:bg-emerald-500 disabled:opacity-40"
              >
                <MdSend className={`h-4 w-4 ${sending ? "animate-pulse" : ""}`} />
                Send Contact
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
