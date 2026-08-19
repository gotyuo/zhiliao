import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { staffProfiles, type InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { hashPassword } from "./localAuth";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("数据库连接不可用，请检查 DATABASE_URL。");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  for (const key of ["name", "email", "loginMethod"] as const) {
    if (user[key] !== undefined) {
      values[key] = user[key] ?? null;
      updateSet[key] = values[key];
    }
  }
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
}

export async function getStaffProfileByUserId(userId: number) {
  const db = await requireDb();
  return (await db.select().from(staffProfiles).where(eq(staffProfiles.userId, userId)).limit(1))[0];
}

export async function getLocalUserByUsername(username: string) {
  const db = await requireDb();
  const row = (await db.select({ user: users, profile: staffProfiles })
    .from(staffProfiles)
    .innerJoin(users, eq(staffProfiles.userId, users.id))
    .where(eq(staffProfiles.username, username.trim().toLowerCase()))
    .limit(1))[0];
  return row;
}

export async function provisionLocalAdmin(username: string, password: string) {
  const normalized = username.trim().toLowerCase();
  const existing = await getLocalUserByUsername(normalized);
  if (existing) return existing;
  const db = await requireDb();
  const passwordHash = await hashPassword(password);
  await db.insert(users).values({
    openId: `local:${normalized}`,
    name: "系统管理员",
    loginMethod: "local",
    role: "admin",
    lastSignedIn: new Date(),
  });
  const user = await getUserByOpenId(`local:${normalized}`);
  if (!user) throw new Error("无法创建本地管理员账号");
  await db.insert(staffProfiles).values({
    userId: user.id,
    username: normalized,
    passwordHash,
    staffRole: "admin",
    title: "系统管理员",
    isActive: true,
  });
  return { user, profile: (await getStaffProfileByUserId(user.id))! };
}

export async function ensureStaffProfile(userId: number, preferredRole: "admin" | "doctor" | "frontdesk" = "frontdesk") {
  const existing = await getStaffProfileByUserId(userId);
  if (existing) return existing;
  const db = await requireDb();
  await db.insert(staffProfiles).values({ userId, staffRole: preferredRole, isActive: true });
  return (await getStaffProfileByUserId(userId))!;
}

