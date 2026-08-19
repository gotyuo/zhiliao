import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, jwtVerify } from "jose";
import type { Request } from "express";
import { parse as parseCookie } from "cookie";
import type { User } from "../drizzle/schema";
import { getLocalUserByUsername, getUserById, provisionLocalAdmin } from "./db";

const scrypt = promisify(scryptCallback);
export const LOCAL_SESSION_COOKIE = "clinic_local_session";

function secretKey() {
  const configured = process.env.JWT_SECRET;
  if (!configured) throw new Error("JWT_SECRET is required for local account login");
  return new TextEncoder().encode(configured);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, hash] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "base64url");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export async function createLocalSession(user: User) {
  return new SignJWT({ usernameDigest: createHash("sha256").update(user.openId).digest("hex") })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secretKey());
}

export async function getLocalSessionUser(req: Request): Promise<User | null> {
  const token = parseCookie(req.headers.cookie ?? "")[LOCAL_SESSION_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId)) return null;
    return (await getUserById(userId)) ?? null;
  } catch {
    return null;
  }
}

export async function localLogin(username: string, password: string) {
  const record = await getLocalUserByUsername(username);
  if (!record?.profile.passwordHash || !record.profile.isActive) return null;
  const accepted = await verifyPassword(password, record.profile.passwordHash);
  return accepted ? record.user : null;
}

export async function ensureBootstrapAdmin() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!username || !password) return;
  await provisionLocalAdmin(username, password);
}

