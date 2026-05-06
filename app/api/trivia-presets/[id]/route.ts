import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized } from "@/lib/auth/host";
import {
  deleteTriviaPreset,
  updateTriviaPreset,
} from "@/lib/db/queries";
import type { UpdateTriviaPresetResponse } from "@/lib/api/contract";

// Permissive: half-filled rows are scrubbed server-side by
// coerceTriviaQuestions before persistence.
const TriviaQuestionSchema = z
  .object({
    id: z.string().min(1).max(64),
    prompt: z.string().max(500),
    choices: z.array(z.string().max(200)).max(8),
    correctIndex: z.number().int().nonnegative(),
  })
  .strict();

const PatchBodySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    questions: z.array(TriviaQuestionSchema).max(100).optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse<UpdateTriviaPresetResponse | { error: string }>> {
  if (!(await isHostAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = PatchBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const preset = await updateTriviaPreset({ id: params.id, ...parsed.data });
  if (!preset) {
    return NextResponse.json({ error: "Preset not found" }, { status: 404 });
  }
  return NextResponse.json({ preset });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse<{ ok: true } | { error: string }>> {
  if (!(await isHostAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ok = await deleteTriviaPreset(params.id);
  if (!ok) {
    return NextResponse.json({ error: "Preset not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
