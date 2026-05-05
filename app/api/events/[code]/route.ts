import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized } from "@/lib/auth/host";
import {
  deleteEvent,
  getEventByCode,
  updateEvent,
} from "@/lib/db/queries";
import { normalizeEventCode } from "@/lib/utils/code";
import type {
  GetEventResponse,
  UpdateEventResponse,
} from "@/lib/api/contract";

const ChallengeEntrySchema = z.object({
  enabled: z.boolean(),
  threshold: z.number().finite(),
  order: z.number().int().nonnegative().optional(),
});

const ChallengesSchema = z
  .object({
    distance: ChallengeEntrySchema,
    steps: ChallengeEntrySchema,
    taps: ChallengeEntrySchema,
    scream: ChallengeEntrySchema,
    shake: ChallengeEntrySchema,
    spin: ChallengeEntrySchema,
    north: ChallengeEntrySchema,
  })
  .strict();

const PatchSchema = z
  .object({
    title: z.string().max(120).optional(),
    groomName: z.string().max(120).optional(),
    challenges: ChallengesSchema.optional(),
    teams: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            name: z.string().max(80).optional(),
            emoji: z.string().max(8).optional(),
            color: z.string().max(120).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export async function GET(
  _req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<GetEventResponse | { error: string }>> {
  const code = normalizeEventCode(params.code);
  if (!code) {
    return NextResponse.json({ error: "Invalid event code" }, { status: 400 });
  }
  const result = await getEventByCode(code);
  if (!result) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}

export async function PATCH(
  req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<UpdateEventResponse | { error: string }>> {
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
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await updateEvent(code, parsed.data);
  if (!result) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<{ ok: true } | { error: string }>> {
  if (!(await isHostAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const code = normalizeEventCode(params.code);
  if (!code) {
    return NextResponse.json({ error: "Invalid event code" }, { status: 400 });
  }
  const ok = await deleteEvent(code);
  if (!ok) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
