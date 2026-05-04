import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized, isHostPlayer } from "@/lib/auth/host";
import { startRound } from "@/lib/db/queries";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { StartRoundResponse } from "@/lib/api/contract";

const BodySchema = z
  .object({
    playerId: z.string().uuid().optional(),
    redo: z.boolean().optional(),
    roundIndex: z.number().int().nonnegative().optional(),
  })
  .strict();

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<StartRoundResponse | { error: string }>> {
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

  const result = await startRound({
    code,
    redo: parsed.data.redo,
    roundIndex: parsed.data.roundIndex,
  });
  if ("error" in result) {
    if (result.error === "not-found") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (result.error === "all-decided") {
      return NextResponse.json(
        { error: "All rounds are decided" },
        { status: 409 },
      );
    }
    if (result.error === "round-live") {
      return NextResponse.json(
        { error: "A round is already live" },
        { status: 409 },
      );
    }
    if (result.error === "invalid-index") {
      return NextResponse.json(
        { error: "Invalid round index" },
        { status: 400 },
      );
    }
  } else {
    try {
      if (result.progressReset) {
        await publishFromServer(code, {
          kind: "progress-reset",
          ts: Date.now(),
        });
      }
      await publishFromServer(code, {
        kind: "round-start",
        roundIndex: result.event.currentRoundIndex ?? 0,
        challenge: result.challenge,
        startsAt: result.startsAt,
        ts: Date.now(),
      });
    } catch (err) {
      console.error("[round/start] PubNub publish failed", err);
    }
    return NextResponse.json({
      event: result.event,
      challenge: result.challenge,
      startsAt: result.startsAt,
    });
  }

  return NextResponse.json({ error: "Unknown error" }, { status: 500 });
}
