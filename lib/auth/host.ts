import "server-only";
import { cookies } from "next/headers";

const COOKIE_NAME = "toasty-host";

export async function isHostAuthorized(): Promise<boolean> {
  const c = await cookies();
  const v = c.get(COOKIE_NAME)?.value;
  return !!v && v === process.env.HOST_PASSWORD;
}

export async function setHostCookie(password: string): Promise<boolean> {
  if (!process.env.HOST_PASSWORD || password !== process.env.HOST_PASSWORD) return false;
  const c = await cookies();
  c.set(COOKIE_NAME, password, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return true;
}

export async function clearHostCookie(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE_NAME);
}

import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Verify that `playerId` is the designated host of the event identified by
 * `code`. Returns true if so, false otherwise (including event-not-found).
 */
export async function isHostPlayer(
  code: string,
  playerId: string | undefined,
): Promise<boolean> {
  if (!playerId) return false;
  const rows = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.code, code), eq(events.hostPlayerId, playerId)))
    .limit(1);
  return rows.length > 0;
}
