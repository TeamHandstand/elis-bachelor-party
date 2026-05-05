import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized } from "@/lib/auth/host";
import {
  deleteTeam,
  isDeviceOnTeam,
  renameTeam,
} from "@/lib/db/queries";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { UpdateTeamResponse } from "@/lib/api/contract";

const PatchSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    emoji: z.string().trim().min(1).max(8).optional(),
    deviceId: z.string().min(1).max(120).optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: { code: string; teamId: string } },
): Promise<NextResponse<UpdateTeamResponse | { error: string }>> {
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
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, emoji, deviceId } = parsed.data;
  if (name === undefined && emoji === undefined) {
    return NextResponse.json(
      { error: "Provide name or emoji" },
      { status: 400 },
    );
  }

  const cookieAuthed = await isHostAuthorized();
  let memberAuthed = false;
  if (!cookieAuthed && deviceId) {
    memberAuthed = await isDeviceOnTeam({
      code,
      teamId: params.teamId,
      deviceId,
    });
  }
  if (!cookieAuthed && !memberAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const team = await renameTeam({
    code,
    teamId: params.teamId,
    name,
    emoji,
  });
  if (!team) {
    return NextResponse.json(
      { error: "Team or event not found" },
      { status: 404 },
    );
  }

  try {
    await publishFromServer(code, {
      kind: "team-renamed",
      teamId: team.id,
      name: team.name,
      emoji: team.emoji,
      ts: Date.now(),
    });
  } catch (err) {
    console.error("[team-rename] PubNub publish failed", err);
  }

  return NextResponse.json({ team });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { code: string; teamId: string } },
): Promise<NextResponse<{ ok: true } | { error: string }>> {
  if (!(await isHostAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const code = normalizeEventCode(params.code);
  if (!code) {
    return NextResponse.json({ error: "Invalid event code" }, { status: 400 });
  }

  const result = await deleteTeam({ code, teamId: params.teamId });
  if ("error" in result) {
    if (result.error === "not-found") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Team not in this event" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
