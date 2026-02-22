import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { MessageMedia } from "whatsapp-web.js";

import { statusStore } from "@/server/store/statusStore";
import { createWwebjsClient, resolveDataPath } from "@/server/whatsapp/client";
import { toWhatsAppChatId } from "@/server/whatsapp/phone";

const MAX_RECONNECT_DELAY_MS = 30_000;

interface SessionContext {
  reconnectAttempts: number;
  isInitialized: boolean;
  initializePromise?: Promise<void>;
  reconnectTimer?: NodeJS.Timeout;
  client: ReturnType<typeof createWwebjsClient>;
}

class SessionManager {
  private readonly sessions = new Map<string, SessionContext>();

  private isBrowserLockError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("The browser is already running for");
  }

  private normalizeInitError(error: unknown) {
    const raw = error instanceof Error ? error.message : String(error);
    if (this.isBrowserLockError(error)) {
      return `${raw} Stop other Next/worker processes using this session, then retry.`;
    }
    return raw;
  }

  private tryReleaseSessionBrowserLock(sessionId: string) {
    try {
      spawnSync("pkill", ["-f", `session-${sessionId}`], {
        stdio: "ignore",
      });
    } catch {
      // ignore recovery errors; caller will still receive the original init error
    }

    try {
      const sessionDir = path.join(resolveDataPath(), `session-${sessionId}`);
      const lockCandidates = [
        path.join(sessionDir, "SingletonLock"),
        path.join(sessionDir, "SingletonCookie"),
        path.join(sessionDir, "SingletonSocket"),
      ];

      for (const filePath of lockCandidates) {
        if (fs.existsSync(filePath)) {
          fs.rmSync(filePath, { force: true });
        }
      }
    } catch {
      // ignore stale lock cleanup errors
    }
  }

  private async initializeWithRecovery(sessionId: string, context: SessionContext) {
    try {
      await context.client.initialize();
      return;
    } catch (error) {
      if (!this.isBrowserLockError(error)) {
        throw error;
      }

      this.tryReleaseSessionBrowserLock(sessionId);

      try {
        await context.client.destroy();
      } catch {
        // ignore
      }

      const replacementClient = createWwebjsClient(sessionId);
      const replacementContext: SessionContext = {
        reconnectAttempts: context.reconnectAttempts,
        isInitialized: false,
        client: replacementClient,
      };
      this.attachEvents(sessionId, replacementContext);
      this.sessions.set(sessionId, replacementContext);

      await replacementClient.initialize();
      replacementContext.isInitialized = true;
      return;
    }
  }

  private getDefaultSessionId() {
    return process.env.DEFAULT_SESSION_ID || "main";
  }

  private getOrCreateContext(sessionId: string) {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const client = createWwebjsClient(sessionId);
    const context: SessionContext = {
      reconnectAttempts: 0,
      isInitialized: false,
      client,
    };

    this.attachEvents(sessionId, context);
    this.sessions.set(sessionId, context);
    statusStore.upsertSession(sessionId, {
      status: "connecting",
      reconnectAttempts: 0,
    });

    return context;
  }

  private attachEvents(sessionId: string, context: SessionContext) {
    const { client } = context;

    client.on("qr", (qr: string) => {
      statusStore.upsertSession(sessionId, {
        status: "qr",
        qr,
      });
    });

    client.on("authenticated", () => {
      context.isInitialized = true;
      context.reconnectAttempts = 0;
      statusStore.upsertSession(sessionId, {
        status: "authenticated",
        reconnectAttempts: 0,
      });
    });

    client.on("ready", () => {
      context.isInitialized = true;
      context.reconnectAttempts = 0;
      statusStore.upsertSession(sessionId, {
        status: "ready",
        reconnectAttempts: 0,
      });
    });

    client.on("auth_failure", (message: string) => {
      context.isInitialized = false;
      statusStore.upsertSession(sessionId, {
        status: "auth_failure",
        lastError: message,
      });
      this.scheduleReconnect(sessionId, context);
    });

    client.on("disconnected", (reason: string) => {
      context.isInitialized = false;
      statusStore.upsertSession(sessionId, {
        status: "disconnected",
        lastError: reason,
      });
      this.scheduleReconnect(sessionId, context);
    });
  }

  private scheduleReconnect(sessionId: string, context: SessionContext) {
    if (context.reconnectTimer) {
      return;
    }

    context.reconnectAttempts += 1;
    const delayMs = Math.min(
      MAX_RECONNECT_DELAY_MS,
      2 ** context.reconnectAttempts * 1000,
    );

    statusStore.upsertSession(sessionId, {
      status: "connecting",
      reconnectAttempts: context.reconnectAttempts,
    });

    context.reconnectTimer = setTimeout(async () => {
      context.reconnectTimer = undefined;
      try {
        await this.reconnect(sessionId);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown reconnect error";
        statusStore.upsertSession(sessionId, {
          status: "disconnected",
          lastError: message,
          reconnectAttempts: context.reconnectAttempts,
        });
        this.scheduleReconnect(sessionId, context);
      }
    }, delayMs);
  }

  async ensureSession(sessionId = this.getDefaultSessionId()) {
    const context = this.getOrCreateContext(sessionId);

    if (context.isInitialized) {
      return context.client;
    }

    if (!context.initializePromise) {
      context.initializePromise = this.initializeWithRecovery(sessionId, context)
        .then(() => {
          context.isInitialized = true;
        })
        .catch((error) => {
          context.isInitialized = false;
          const message = this.normalizeInitError(error);
          throw new Error(message);
        })
        .finally(() => {
        context.initializePromise = undefined;
      });
    }

    await context.initializePromise;
    return context.client;
  }

  startSession(sessionId = this.getDefaultSessionId()) {
    const context = this.getOrCreateContext(sessionId);

    if (context.isInitialized || context.initializePromise) {
      return;
    }

    context.initializePromise = this.initializeWithRecovery(sessionId, context)
      .then(() => {
        context.isInitialized = true;
      })
      .catch((error) => {
        context.isInitialized = false;
        const message = this.normalizeInitError(error);
        statusStore.upsertSession(sessionId, {
          status: "disconnected",
          lastError: message,
        });
      })
      .finally(() => {
        context.initializePromise = undefined;
      });
  }

  discoverSessions() {
    const dataPath = resolveDataPath();

    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dataPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("session-"))
        .map((entry) => entry.name.replace(/^session-/, ""));
    } catch {
      return [] as string[];
    }

    const discovered = Array.from(new Set(entries));
    for (const sessionId of discovered) {
      this.getOrCreateContext(sessionId);
      statusStore.upsertSession(sessionId, {
        status: statusStore.getSession(sessionId)?.status ?? "unknown",
      });
    }

    return discovered;
  }

  getSessionState(sessionId: string) {
    return (
      statusStore.getSession(sessionId) ??
      statusStore.upsertSession(sessionId, {
        status: "unknown",
        reconnectAttempts: 0,
      })
    );
  }

  getAllSessionStates() {
    return statusStore.getSessions();
  }

  getQrString(sessionId: string) {
    return statusStore.getSession(sessionId)?.qr || null;
  }

  async reconnect(sessionId: string) {
    const context = this.getOrCreateContext(sessionId);
    statusStore.upsertSession(sessionId, {
      status: "connecting",
      lastError: undefined,
    });

    try {
      await context.client.destroy();
    } catch {
      // ignore destroy errors on reconnect
    }

    const replacementClient = createWwebjsClient(sessionId);
    const replacementContext: SessionContext = {
      reconnectAttempts: context.reconnectAttempts,
      isInitialized: false,
      client: replacementClient,
    };

    this.attachEvents(sessionId, replacementContext);
    this.sessions.set(sessionId, replacementContext);
    replacementContext.initializePromise = this.initializeWithRecovery(
      sessionId,
      replacementContext,
    )
      .then(() => {
        replacementContext.isInitialized = true;
      })
      .catch((error) => {
        replacementContext.isInitialized = false;
        const message = this.normalizeInitError(error);
        throw new Error(message);
      })
      .finally(() => {
        replacementContext.initializePromise = undefined;
      });

    await replacementContext.initializePromise;
  }

  async logout(sessionId: string) {
    const context = this.sessions.get(sessionId);
    if (!context) {
      return;
    }

    if (context.reconnectTimer) {
      clearTimeout(context.reconnectTimer);
    }

    await context.client.logout();
    await context.client.destroy();
    this.sessions.delete(sessionId);

    statusStore.upsertSession(sessionId, {
      status: "disconnected",
      qr: undefined,
      reconnectAttempts: 0,
      lastError: undefined,
    });
  }

  async sendText(sessionId: string, to: string, text: string) {
    const client = await this.ensureSession(sessionId);
    const chatId = toWhatsAppChatId(to);
    return client.sendMessage(chatId, text);
  }

  async sendMedia(params: {
    sessionId: string;
    to: string;
    mediaUrl: string;
    caption?: string;
    filename?: string;
  }) {
    const client = await this.ensureSession(params.sessionId);
    const chatId = toWhatsAppChatId(params.to);

    const media = await MessageMedia.fromUrl(params.mediaUrl, {
      unsafeMime: true,
      filename: params.filename,
    });

    return client.sendMessage(chatId, media, {
      caption: params.caption,
    });
  }

  async getChats(sessionId: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chats = await (client as any).getChats();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return chats.map((chat: any) => ({
      id: chat.id?._serialized ?? String(chat.id),
      name: chat.name || chat.formattedTitle || chat.id?.user || "Unknown",
      isGroup: !!chat.isGroup,
      unreadCount: chat.unreadCount ?? 0,
      timestamp: (chat.timestamp ?? 0) * 1000,
      lastMessage: chat.lastMessage
        ? {
            body: chat.lastMessage.body ?? "",
            type: chat.lastMessage.type ?? "chat",
            timestamp: (chat.lastMessage.timestamp ?? chat.timestamp ?? 0) * 1000,
            fromMe: !!chat.lastMessage.fromMe,
          }
        : null,
      archived: !!chat.archived,
      pinned: !!chat.pinned,
      muteExpiration: chat.muteExpiration,
    }));
  }

  async getChatMessages(sessionId: string, chatId: string, limit = 50) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chat = await (client as any).getChatById(chatId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages = await (chat as any).fetchMessages({ limit });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return messages.map((msg: any) => ({
      id: msg.id?._serialized ?? String(msg.id),
      sessionId,
      from: msg.from,
      to: msg.to,
      fromMe: !!msg.fromMe,
      body: msg.body ?? "",
      type: msg.type ?? "chat",
      timestamp: msg.timestamp ? msg.timestamp * 1000 : Date.now(),
      hasMedia: !!msg.hasMedia,
      mimetype: msg._data?.mimetype,
      filename: msg._data?.filename,
      isForwarded: !!msg.isForwarded,
      isStarred: !!msg.isStarred,
      isStatus: !!msg.isStatus,
      ack: msg.ack ?? 0,
      author: msg.author,
      mentionedIds: msg.mentionedIds ?? [],
      hasQuotedMsg: !!msg.hasQuotedMsg,
      quotedMsgId: msg.hasQuotedMsg ? msg._data?.quotedStanzaID : undefined,
      location: msg.location
        ? {
            latitude: msg.location.latitude,
            longitude: msg.location.longitude,
            description: msg.location.description,
          }
        : undefined,
      vCards: msg.vCards ?? [],
    }));
  }

  async sendSeen(sessionId: string, chatId: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (client as any).sendSeen === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (client as any).sendSeen(chatId);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chat = await (client as any).getChatById(chatId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (chat as any).sendSeen();
  }

  async archiveChat(sessionId: string, chatId: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chat = await (client as any).getChatById(chatId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (chat as any).archive();
  }

  async unarchiveChat(sessionId: string, chatId: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chat = await (client as any).getChatById(chatId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (chat as any).unarchive();
  }

  async muteChat(sessionId: string, chatId: string, unmuteDate?: Date) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chat = await (client as any).getChatById(chatId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (chat as any).mute(unmuteDate);
  }

  async unmuteChat(sessionId: string, chatId: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chat = await (client as any).getChatById(chatId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (chat as any).unmute();
  }

  async pinChat(sessionId: string, chatId: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chat = await (client as any).getChatById(chatId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (chat as any).pin();
  }

  async unpinChat(sessionId: string, chatId: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chat = await (client as any).getChatById(chatId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (chat as any).unpin();
  }

  async deleteChat(sessionId: string, chatId: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (client as any).deleteChat === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (client as any).deleteChat(chatId);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chat = await (client as any).getChatById(chatId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (chat as any).delete?.();
  }

  async clearChatMessages(sessionId: string, chatId: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chat = await (client as any).getChatById(chatId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (chat as any).clearMessages();
  }

  async sendTyping(sessionId: string, chatId: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chat = await (client as any).getChatById(chatId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (chat as any).sendStateTyping();
  }

  async sendRecording(sessionId: string, chatId: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chat = await (client as any).getChatById(chatId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (chat as any).sendStateRecording();
  }

  async clearChatState(sessionId: string, chatId: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chat = await (client as any).getChatById(chatId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (chat as any).clearState();
  }

  async replyToMessage(sessionId: string, messageId: string, content: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = await (client as any).getMessageById(messageId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (msg as any).reply(content);
  }

  async forwardMessage(sessionId: string, messageId: string, chatId: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = await (client as any).getMessageById(messageId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (msg as any).forward(chatId);
  }

  async deleteMessage(sessionId: string, messageId: string, everyone = false) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = await (client as any).getMessageById(messageId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (msg as any).delete(everyone);
  }

  async starMessage(sessionId: string, messageId: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = await (client as any).getMessageById(messageId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (msg as any).star();
  }

  async unstarMessage(sessionId: string, messageId: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = await (client as any).getMessageById(messageId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (msg as any).unstar();
  }

  async reactToMessage(sessionId: string, messageId: string, reaction: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = await (client as any).getMessageById(messageId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (msg as any).react(reaction);
  }

  async editMessage(sessionId: string, messageId: string, content: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = await (client as any).getMessageById(messageId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (msg as any).edit === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (msg as any).edit(content);
    }
    throw new Error("Edit is not supported for this message/client version");
  }

  async pinMessage(sessionId: string, messageId: string, duration = 604800) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = await (client as any).getMessageById(messageId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (msg as any).pin === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (msg as any).pin(duration);
    }
    return null;
  }

  async unpinMessage(sessionId: string, messageId: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = await (client as any).getMessageById(messageId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (msg as any).unpin === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (msg as any).unpin();
    }
    return null;
  }

  async downloadMedia(sessionId: string, messageId: string) {
    const client = await this.ensureSession(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = await (client as any).getMessageById(messageId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const media = await (msg as any).downloadMedia();

    if (!media?.data || !media?.mimetype) {
      throw new Error("Media not available");
    }

    return {
      mimetype: media.mimetype,
      filename: media.filename,
      dataUrl: `data:${media.mimetype};base64,${media.data}`,
    };
  }

  async captureSessionScreenshot(sessionId: string) {
    const client = await this.ensureSession(sessionId);
    const page = (client as unknown as { pupPage?: { screenshot: (opts: { type: "png"; encoding: "base64"; fullPage: boolean }) => Promise<string> } }).pupPage;

    if (!page) {
      throw new Error("WhatsApp page is not ready for screenshot");
    }

    const base64Png = await page.screenshot({
      type: "png",
      encoding: "base64",
      fullPage: true,
    });

    return `data:image/png;base64,${base64Png}`;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __sessionManager__: SessionManager | undefined;
}

export const sessionManager = globalThis.__sessionManager__ ?? new SessionManager();

if (!globalThis.__sessionManager__) {
  globalThis.__sessionManager__ = sessionManager;
}
