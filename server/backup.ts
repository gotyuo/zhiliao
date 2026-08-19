import type { Express, Request, Response } from "express";
import { existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { backupRecords, backupSettings } from "../drizzle/schema";
import { getDb, getStaffProfileByUserId } from "./db";
import { getLocalSessionUser } from "./localAuth";
import { sdk } from "./_core/sdk";

export function backupDirectory() {
  return path.resolve(process.env.BACKUP_DIR ?? "./runtime/backups");
}

function safeBackupFilename(filename: string) {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]*\.sql\.gz$/.test(filename) ? filename : null;
}

async function requireBackupAdmin(req: Request) {
  let user = await getLocalSessionUser(req);
  if (!user) {
    try { user = await sdk.authenticateRequest(req); } catch { user = null; }
  }
  if (!user) return null;
  const profile = await getStaffProfileByUserId(user.id);
  return user.role === "admin" || profile?.staffRole === "admin" ? user : null;
}

export async function requestManualBackup() {
  const directory = backupDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, ".backup-request"), new Date().toISOString(), "utf8");
}

export function registerBackupRoutes(app: Express) {
  app.post("/api/internal/backups", async (req, res) => {
    if (!process.env.BACKUP_SERVICE_TOKEN || req.get("x-backup-token") !== process.env.BACKUP_SERVICE_TOKEN) {
      return res.status(401).json({ error: "unauthorized backup reporter" });
    }
    const filename = typeof req.body?.filename === "string" ? safeBackupFilename(req.body.filename) : null;
    if (!filename) return res.status(400).json({ error: "invalid backup filename" });
    const filePath = path.join(backupDirectory(), filename);
    try {
      const info = await stat(filePath);
      const db = await getDb();
      if (db) {
        await db.insert(backupRecords).values({ filename, sizeBytes: Math.min(info.size, 2_147_483_647), status: "completed" });
        await db.update(backupSettings).set({ lastRunAt: new Date() }).where(eq(backupSettings.id, 1));
      }
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "backup report failed" });
    }
  });

  app.get("/api/backups/download/:filename", async (req: Request, res: Response) => {
    const user = await requireBackupAdmin(req);
    const filename = safeBackupFilename(req.params.filename);
    if (!user) return res.status(403).json({ error: "forbidden" });
    if (!filename) return res.status(400).json({ error: "invalid filename" });
    const filePath = path.join(backupDirectory(), filename);
    if (!existsSync(filePath)) return res.status(404).json({ error: "not found" });
    return res.download(filePath, filename);
  });
}

