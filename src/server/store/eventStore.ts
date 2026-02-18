/**
 * In-memory event store for WhatsApp messages, calls, reactions, and other events.
 * Provides ring-buffer storage and an SSE event bus for real-time streaming.
 */

/* ------------------------------------------------------------------ */
/*  Serialised event shapes                                            */
/* ------------------------------------------------------------------ */

export interface WaMessage {
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
  author?: string;          // group sender
  mentionedIds: string[];
  hasQuotedMsg: boolean;
  quotedMsgId?: string;
  location?: { latitude: number; longitude: number; description?: string };
  vCards: string[];
  chatName?: string;
  contactName?: string;
}

export interface WaMessageAck {
  messageId: string;
  sessionId: string;
  ack: number;              // -1..4
  timestamp: number;
}

export interface WaReaction {
  messageId: string;
  sessionId: string;
  reaction: string;
  senderId: string;
  timestamp: number;
}

export interface WaCall {
  id: string;
  sessionId: string;
  from: string;
  fromMe: boolean;
  isVideo: boolean;
  isGroup: boolean;
  timestamp: number;
  status: "ringing" | "rejected" | "ended";
}

export interface WaGroupNotification {
  id: string;
  sessionId: string;
  chatId: string;
  author: string;
  type: string;             // add, remove, promote, demote, subject, description, etc.
  recipientIds: string[];
  body: string;
  timestamp: number;
}

export type WaEventType =
  | "message"
  | "message_create"
  | "message_ack"
  | "message_edit"
  | "message_reaction"
  | "message_revoke"
  | "incoming_call"
  | "group_join"
  | "group_leave"
  | "group_update"
  | "group_admin_changed"
  | "session_status"
  | "chat_archived"
  | "contact_changed";

export interface WaEvent {
  type: WaEventType;
  sessionId: string;
  timestamp: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}

/* ------------------------------------------------------------------ */
/*  SSE event bus                                                      */
/* ------------------------------------------------------------------ */

type SseListener = (event: WaEvent) => void;

class EventBus {
  private listeners = new Set<SseListener>();

  subscribe(listener: SseListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: WaEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // never let a broken listener crash the bus
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Ring-buffer store                                                   */
/* ------------------------------------------------------------------ */

class EventStore {
  private readonly maxMessages = 2000;
  private readonly maxCalls = 200;
  private readonly maxEvents = 5000;

  readonly bus = new EventBus();

  /** All messages indexed by id */
  private readonly messagesById = new Map<string, WaMessage>();
  /** Messages per chat (chatId → message[]) */
  private readonly messagesByChat = new Map<string, WaMessage[]>();
  /** Flat ordered list for trimming */
  private readonly messageList: WaMessage[] = [];

  private readonly calls: WaCall[] = [];
  private readonly events: WaEvent[] = [];

  /* ---- Messages ---- */

  pushMessage(msg: WaMessage) {
    this.messagesById.set(msg.id, msg);

    const chatId = msg.fromMe ? msg.to : msg.from;
    let chatMessages = this.messagesByChat.get(chatId);
    if (!chatMessages) {
      chatMessages = [];
      this.messagesByChat.set(chatId, chatMessages);
    }
    chatMessages.push(msg);

    this.messageList.push(msg);

    // Trim oldest
    if (this.messageList.length > this.maxMessages) {
      const removed = this.messageList.shift()!;
      this.messagesById.delete(removed.id);
      const rChatId = removed.fromMe ? removed.to : removed.from;
      const rChat = this.messagesByChat.get(rChatId);
      if (rChat) {
        const idx = rChat.findIndex((m) => m.id === removed.id);
        if (idx !== -1) rChat.splice(idx, 1);
        if (rChat.length === 0) this.messagesByChat.delete(rChatId);
      }
    }

    this.pushEvent({
      type: "message",
      sessionId: msg.sessionId,
      timestamp: msg.timestamp,
      payload: msg,
    });
  }

  updateMessageAck(ack: WaMessageAck) {
    const existing = this.messagesById.get(ack.messageId);
    if (existing) {
      existing.ack = ack.ack;
    }
    this.pushEvent({
      type: "message_ack",
      sessionId: ack.sessionId,
      timestamp: ack.timestamp,
      payload: ack,
    });
  }

  getMessage(id: string) {
    return this.messagesById.get(id) ?? null;
  }

  getChatMessages(chatId: string, limit = 50) {
    const msgs = this.messagesByChat.get(chatId) ?? [];
    return msgs.slice(-limit);
  }

  getRecentMessages(sessionIdOrLimit?: string | number, limit = 50) {
    if (typeof sessionIdOrLimit === "string") {
      return this.messageList.filter((m) => m.sessionId === sessionIdOrLimit).slice(-limit);
    }
    return this.messageList.slice(-(sessionIdOrLimit ?? limit));
  }

  getAllChatIds() {
    return Array.from(this.messagesByChat.keys());
  }

  /* ---- Calls ---- */

  pushCall(call: WaCall) {
    this.calls.push(call);
    if (this.calls.length > this.maxCalls) this.calls.shift();
    this.pushEvent({
      type: "incoming_call",
      sessionId: call.sessionId,
      timestamp: call.timestamp,
      payload: call,
    });
  }

  updateCallStatus(callId: string, status: WaCall["status"]) {
    const existing = this.calls.find((c) => c.id === callId);
    if (existing) existing.status = status;
  }

  getCalls(sessionIdOrLimit?: string | number, limit = 50) {
    if (typeof sessionIdOrLimit === "string") {
      return this.calls.filter((c) => c.sessionId === sessionIdOrLimit).slice(-limit);
    }
    return this.calls.slice(-(sessionIdOrLimit ?? limit));
  }

  /* ---- Generic events ---- */

  pushEvent(event: WaEvent) {
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.shift();
    this.bus.emit(event);
  }

  getEvents(limit = 100) {
    return this.events.slice(-limit);
  }
}

/* ------------------------------------------------------------------ */
/*  Singleton (survives HMR)                                           */
/* ------------------------------------------------------------------ */

declare global {
  // eslint-disable-next-line no-var
  var __eventStore__: EventStore | undefined;
}

export const eventStore = globalThis.__eventStore__ ?? new EventStore();

if (!globalThis.__eventStore__) {
  globalThis.__eventStore__ = eventStore;
}
