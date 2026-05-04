import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized } from "@/lib/auth/host";
import { assignPlayerToTeam } from "@/lib/db/queries";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { AssignPlayerResponse } from "@/lib/api/contract";

const BodySchema = z
  .object({
    teamId: z.string().uuid().nullable(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: { code: string; playerId: string } },
): Promise<NextResponse<AssignPlayerResponse | { error: string }>> {
  if (!(await isHostAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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

  const player = await assignPlayerToTeam({
    code,
    playerId: params.playerId,
    teamId: parsed.data.teamId,
  });
  if (!player) {
    return NextResponse.json({ error: "Player or event not found" }, { status: 404 });
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

  return NextResponse.json({ player });
}
