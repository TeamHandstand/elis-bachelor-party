import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized } from "@/lib/auth/host";
import {
  assignPlayerToTeam,
  getPlayerByIdAndEvent,
  renamePlayer,
} from "@/lib/db/queries";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { AssignPlayerResponse } from "@/lib/api/contract";

const BodySchema = z
  .object({
    teamId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).max(40).optional(),
    deviceId: z.string().min(1).max(120).optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: { code: string; playerId: string } },
): Promise<NextResponse<AssignPlayerResponse | { error: string }>> {
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

  const { teamId, name, deviceId } = parsed.data;
  if (teamId === undefined && name === undefined) {
    return NextResponse.json(
      { error: "Provide name or teamId" },
      { status: 400 },
    );
  }

  const cookieAuthed = await isHostAuthorized();
  // Player-self auth: deviceId must match the stored player. Only allows
  // self-rename — never team reassignment.
  let selfAuthed = false;
  if (!cookieAuthed && deviceId && name !== undefined && teamId === undefined) {
    const existing = await getPlayerByIdAndEvent({
      code,
      playerId: params.playerId,
    });
    if (existing && existing.deviceId === deviceId) {
      selfAuthed = true;
    }
  }

  if (!cookieAuthed && !selfAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let player = null;
  if (typeof name === "string") {
    player = await renamePlayer({
      code,
      playerId: params.playerId,
      name,
    });
    if (!player) {
      return NextResponse.json(
        { error: "Player or event not found" },
        { status: 404 },
      );
    }
    try {
      await publishFromServer(code, {
        kind: "player-renamed",
        playerId: player.id,
        name: player.name,
        ts: Date.now(),
      });
    } catch (err) {
      console.error("[player-rename] PubNub publish failed", err);
    }
  }

  if (teamId !== undefined) {
    player = await assignPlayerToTeam({
      code,
      playerId: params.playerId,
      teamId,
    });
    if (!player) {
      return NextResponse.json(
        { error: "Player or event not found" },
        { status: 404 },
      );
    }
    try {
      await publishFromServer(code, {
        kind: "team-assigned",
        playerId: player.id,
        teamId: player.teamId,
        ts: Date.now(),
      });
    } catch (err) {
      console.error("[player-assign] PubNub publish failed", err);
    }
  }

  if (!player) {
    return NextResponse.json(
      { error: "Nothing to update" },
      { status: 400 },
    );
  }

  return NextResponse.json({ player });
}
