import { NextResponse } from "next/server";
import { z } from "zod";
import { submitOpenScore } from "@/lib/db/queries";
import { isOpenGame } from "@/lib/challenges";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { ChallengeId } from "@/lib/types";
import type { SubmitOpenScoreResponse } from "@/lib/api/contract";

const BodySchema = z
  .object({
    playerId: z.string().uuid(),
    gameId: z.string().min(1).max(40),
    score: z.number().finite(),
    meta: z.record(z.unknown()).optional(),
  })
  .strict();

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<SubmitOpenScoreResponse | { error: string }>> {
  const code = normalizeEventCode(params.code);
  if (!code) {
    return NextResponse.json({ error: "Invalid event code" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!isOpenGame(parsed.data.gameId as ChallengeId)) {
    return NextResponse.json({ error: "Unknown game" }, { status: 400 });
  }

  const result = await submitOpenScore({
    code,
    playerId: parsed.data.playerId,
    gameId: parsed.data.gameId,
    score: parsed.data.score,
    meta: parsed.data.meta,
  });

  if ("error" in result) {
    const status = result.error === "not-found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  // Play-once: a second attempt didn't insert. Report the conflict.
  if (!result.inserted) {
    return NextResponse.json({ error: "already-played" }, { status: 409 });
  }

  // Nudge every open-play client to refetch the leaderboard.
  try {
    await publishFromServer(code, {
      kind: "open-score",
      playerId: parsed.data.playerId,
      gameId: parsed.data.gameId,
      ts: Date.now(),
    });
  } catch (err) {
    console.error("[open/score] PubNub publish failed", err);
  }

  return NextResponse.json({ ok: true });
}
