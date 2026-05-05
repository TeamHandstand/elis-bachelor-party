import { NextResponse } from "next/server";
import { isHostAuthorized } from "@/lib/auth/host";
import { deleteTeam } from "@/lib/db/queries";
import { normalizeEventCode } from "@/lib/utils/code";

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
