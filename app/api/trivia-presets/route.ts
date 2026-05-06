import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized } from "@/lib/auth/host";
import {
  createTriviaPreset,
  listTriviaPresets,
} from "@/lib/db/queries";
import type {
  CreateTriviaPresetResponse,
  ListTriviaPresetsResponse,
} from "@/lib/api/contract";

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

const CreateBodySchema = z
  .object({
    name: z.string().min(1).max(120),
    questions: z.array(TriviaQuestionSchema).max(100),
  })
  .strict();

export async function GET(): Promise<
  NextResponse<ListTriviaPresetsResponse | { error: string }>
> {
  if (!(await isHostAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const presets = await listTriviaPresets();
  return NextResponse.json({ presets });
}

export async function POST(
  req: Request,
): Promise<NextResponse<CreateTriviaPresetResponse | { error: string }>> {
  if (!(await isHostAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = CreateBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const preset = await createTriviaPreset(parsed.data);
  return NextResponse.json({ preset });
}
