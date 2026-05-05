import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized } from "@/lib/auth/host";
import { createTeam } from "@/lib/db/queries";
import { normalizeEventCode } from "@/lib/utils/code";
import type { CreateTeamResponse } from "@/lib/api/contract";

const BodySchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    emoji: z.string().trim().min(1).max(8).optional(),
    color: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<CreateTeamResponse | { error: string }>> {
  if (!(await isHostAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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

  const result = await createTeam({ code, ...parsed.data });
  if ("error" in result) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  return NextResponse.json({ team: result.team });
}
