import { MessageMedia } from "whatsapp-web.js";

import { statusStore } from "@/server/store/statusStore";
import { createWwebjsClient } from "@/server/whatsapp/client";
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
      context.initializePromise = context.client
        .initialize()
        .then(() => {
          context.isInitialized = true;
        })
        .catch((error) => {
          context.isInitialized = false;
          throw error;
        })
        .finally(() => {
        context.initializePromise = undefined;
      });
    }

    await context.initializePromise;
    return context.client;
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
    replacementContext.initializePromise = replacementClient
      .initialize()
      .then(() => {
        replacementContext.isInitialized = true;
      })
      .catch((error) => {
        replacementContext.isInitialized = false;
        throw error;
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
