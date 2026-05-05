import { NextResponse } from "next/server";
import { isHostAuthorized } from "@/lib/auth/host";

/**
 * Boolean check: does the calling browser have a valid host cookie?
 * The host cookie is httpOnly, so the client can't read it directly — this
 * endpoint exists so client UIs can conditionally show host-only affordances
 * (e.g., the Start button on the player journey for cookie-host users who
 * aren't the designated host-player).
 */
export async function GET() {
  const isHost = await isHostAuthorized();
  return NextResponse.json({ isHost });
}
