import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized, isHostPlayer } from "@/lib/auth/host";
import { activateEvent } from "@/lib/db/queries";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { ActivateEventResponse } from "@/lib/api/contract";

const BodySchema = z
  .object({
    playerId: z.string().uuid().optional(),
  })
  .strict();

/**
 * Move the event from 'lobby' to 'active' (without starting a round). Auth:
 * host-cookie OR matching host-player. Broadcasts an event-state message so
 * clients on /lobby auto-redirect to /play.
 */
export async function POST(
  req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<ActivateEventResponse | { error: string }>> {
  const code = normalizeEventCode(params.code);
  if (!code) {
    return NextResponse.json({ error: "Invalid event code" }, { status: 400 });
  }

  let json: unknown = {};
  try {
    const text = await req.text();
    json = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const cookieAuthed = await isHostAuthorized();
  const playerAuthed =
    !cookieAuthed && (await isHostPlayer(code, parsed.data.playerId));
  if (!cookieAuthed && !playerAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await activateEvent(code);
  if ("error" in result) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  try {
    await publishFromServer(code, {
      kind: "event-state",
      status: "active",
      ts: Date.now(),
    });
  } catch (err) {
    console.error("[activate] PubNub publish failed", err);
  }

  return NextResponse.json({ event: result.event });
}
