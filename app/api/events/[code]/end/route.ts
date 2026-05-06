import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db/client";
import { and, eq } from "drizzle-orm";
import { isHostAuthorized, isHostPlayer } from "@/lib/auth/host";
import { normalizeEventCode } from "@/lib/utils/code";
import { publishFromServer } from "@/lib/pubnub/server";
import { getEventByCode } from "@/lib/db/queries";

const BodySchema = z
  .object({
    playerId: z.string().uuid().optional(),
    winnerTeamId: z.string().uuid().optional(),
  })
  .strict();

/**
 * Force-end the heptathlon. Distinct from /round/end (which decides one round).
 * If `winnerTeamId` is supplied and belongs to this event, sets it as the
 * overall champion. Otherwise the event ends with no winner.
 *
 * Auth: host-cookie OR matching host-player.
 */
export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
  const code = normalizeEventCode(params.code);
  if (!code) {
    return NextResponse.json({ error: "invalid event code" }, { status: 400 });
  }

  let json: unknown = {};
  try {
    const text = await req.text();
    json = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const cookieAuthed = await isHostAuthorized();
  const playerAuthed =
    !cookieAuthed && (await isHostPlayer(code, parsed.data.playerId));
  if (!cookieAuthed && !playerAuthed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const existing = await getEventByCode(code);
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // If a winner is requested, validate it belongs to this event. Otherwise,
  // auto-compute from cumulative round wins (same logic as the old end-of-
  // last-round path: most wins; tiebreaker = won-north; final fallback =
  // earliest first win).
  let winnerTeamId: string | null = null;
  if (parsed.data.winnerTeamId) {
    const matching = existing.teams.find(
      (t) => t.id === parsed.data.winnerTeamId,
    );
    if (!matching) {
      return NextResponse.json(
        { error: "winnerTeamId not in this event" },
        { status: 400 },
      );
    }
    winnerTeamId = matching.id;
  } else if (existing.event.roundWinners.length > 0) {
    const winners = existing.event.roundWinners;
    const counts = new Map<string, number>();
    for (const w of winners) {
      counts.set(w.teamId, (counts.get(w.teamId) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (
      sorted.length === 1 ||
      (sorted.length > 1 && sorted[0][1] > sorted[1][1])
    ) {
      winnerTeamId = sorted[0][0];
    } else {
      const tiedCount = sorted[0][1];
      const tiedTeamIds = new Set(
        sorted.filter(([, c]) => c === tiedCount).map(([t]) => t),
      );
      const northWinner = winners.find(
        (w) => w.challenge === "north" && tiedTeamIds.has(w.teamId),
      );
      if (northWinner) {
        winnerTeamId = northWinner.teamId;
      } else {
        const teamFirstWin = new Map<string, number>();
        for (const w of winners) {
          if (!tiedTeamIds.has(w.teamId)) continue;
          const cur = teamFirstWin.get(w.teamId);
          if (cur === undefined || w.decidedAt < cur) {
            teamFirstWin.set(w.teamId, w.decidedAt);
          }
        }
        const earliest = [...teamFirstWin.entries()].sort(
          (a, b) => a[1] - b[1],
        );
        winnerTeamId = earliest[0]?.[0] ?? sorted[0][0];
      }
    }
  }

  await db
    .update(schema.events)
    .set({
      status: "finished",
      finishedAt: new Date(),
      winnerTeamId,
      // Clear any in-flight live round so clients don't keep showing
      // countdown/decided UI on the finished screen.
      currentRoundStatus: null,
    })
    .where(eq(schema.events.code, code));

  try {
    await publishFromServer(code, {
      kind: "event-state",
      status: "finished",
      ts: Date.now(),
      ...(winnerTeamId ? { winnerTeamId } : {}),
    });
  } catch (err) {
    console.warn("[end] PubNub publish failed", err);
  }

  const refreshed = await getEventByCode(code);
  return NextResponse.json({ event: refreshed!.event });
}
