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
