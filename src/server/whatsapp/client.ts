import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Client, LocalAuth } from "whatsapp-web.js";

function ensureWritableDirectory(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
  fs.accessSync(dirPath, fs.constants.W_OK);
}

export function resolveDataPath() {
  const configuredPath = process.env.WWEBJS_DATA_DIR;
  const candidates = [
    configuredPath,
    path.resolve(process.cwd(), ".data/wwebjs"),
    path.resolve(os.homedir(), ".wwebjs"),
  ].filter((value): value is string => Boolean(value));

  const failures: string[] = [];

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);

    try {
      ensureWritableDirectory(resolved);
      return resolved;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${resolved}: ${message}`);
    }
  }

  throw new Error(
    `Unable to create a writable WhatsApp auth directory. Set WWEBJS_DATA_DIR to a writable path. Tried: ${failures.join(" | ")}`,
  );
}

export function createWwebjsClient(sessionId: string) {
  const resolvedDir = resolveDataPath();

  return new Client({
    authStrategy: new LocalAuth({
      clientId: sessionId,
      dataPath: resolvedDir,
    }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    },
  });
}
