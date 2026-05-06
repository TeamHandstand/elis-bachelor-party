import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized, isHostPlayer } from "@/lib/auth/host";
import { resetRound } from "@/lib/db/queries";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { EventConfig } from "@/lib/types";

const BodySchema = z
  .object({
    playerId: z.string().uuid().optional(),
    roundIndex: z.number().int().nonnegative(),
  })
  .strict();

interface ResetRoundResponse {
  event: EventConfig;
}

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<ResetRoundResponse | { error: string }>> {
  const code = normalizeEventCode(params.code);
  if (!code) {
    return NextResponse.json({ error: "Invalid event code" }, { status: 400 });
  }

  let json: unknown;
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

  const result = await resetRound({
    code,
    roundIndex: parsed.data.roundIndex,
  });
  if ("error" in result) {
    if (result.error === "not-found") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Invalid round index" },
      { status: 400 },
    );
  }

  // Tell every connected client to wipe its in-memory progress for the
  // affected rounds (and forward), preserving earlier rounds' progress so
  // the journey's per-round leaderboard / place medal stays intact.
  try {
    await publishFromServer(code, {
      kind: "round-reset",
      fromIndex: parsed.data.roundIndex,
      ts: Date.now(),
    });
  } catch (err) {
    console.error("[round/reset] PubNub publish failed", err);
  }

  return NextResponse.json({ event: result.event });
}
