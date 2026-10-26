import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context } from "hono";
import { env } from "./env";
import type { SessionUser } from "../middleware/auth";

export const SESSION_COOKIE = "simak_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const sessions = new Map<string, { user: SessionUser; expiresAt: number }>();

function signature(sessionId: string) {
  return createHmac("sha256", env.SESSION_SECRET).update(sessionId).digest("base64url");
}

function signedValue(sessionId: string) {
  return `${sessionId}.${signature(sessionId)}`;
}

function verifySignedValue(value: string) {
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const sessionId = value.slice(0, separator);
  const actual = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(signature(sessionId));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return sessionId;
}

function cleanupExpiredSessions(now = Date.now()) {
  for (const [sessionId, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(sessionId);
  }
}

export function createSession(user: SessionUser) {
  cleanupExpiredSessions();
  const sessionId = randomUUID();
  sessions.set(sessionId, {
    user,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  });
  return signedValue(sessionId);
}

export function resolveSession(value: string | undefined): SessionUser | null {
  if (!value) return null;
  cleanupExpiredSessions();

  const sessionId = verifySignedValue(value);
  if (!sessionId) return null;

  const session = sessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return session.user;
}

export function revokeSession(value: string | undefined) {
  if (!value) return;
  const sessionId = verifySignedValue(value);
  if (sessionId) sessions.delete(sessionId);
}

export function attachSessionCookie(c: Context, value: string) {
  setCookie(c, SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export function getSessionFromRequest(c: Context) {
  return resolveSession(getCookie(c, SESSION_COOKIE));
}

