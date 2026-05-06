import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized } from "@/lib/auth/host";
import { duplicateEvent } from "@/lib/db/queries";
import { normalizeEventCode } from "@/lib/utils/code";
import type { DuplicateEventResponse } from "@/lib/api/contract";

const BodySchema = z
  .object({
    copyTeamsAndPlayers: z.boolean().optional(),
  })
  .strict();

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<DuplicateEventResponse | { error: string }>> {
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

  const result = await duplicateEvent({
    sourceCode: code,
    copyTeamsAndPlayers: parsed.data.copyTeamsAndPlayers ?? false,
  });
  if (!result) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  return NextResponse.json(result, { status: 201 });
}
