"use client";

import { useEffect, useState } from "react";
import {
  createTriviaPreset,
  deleteTriviaPreset,
  listTriviaPresets,
  updateTriviaPreset,
} from "./_fetch";
import {
  coerceTriviaQuestions,
  emptyTriviaQuestion,
} from "@/lib/challenges";
import type { TriviaPreset, TriviaQuestion } from "@/lib/types";
import { TriviaQuestionsEditor } from "./TriviaQuestionsEditor";

/**
 * Top-level panel for browsing, editing, creating, and deleting trivia
 * presets. Lives on its own host tab so the host can build a library
 * independently of any single event.
 */
export default function TriviaPresetLibrary() {
  const [presets, setPresets] = useState<TriviaPreset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creatingName, setCreatingName] = useState("");

  async function reload() {
    try {
      const res = await listTriviaPresets();
      setPresets(res.presets);
      setError(null);
    } catch (e) {
      setError((e as Error).message ?? "Failed to load presets");
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function create() {
    const name = creatingName.trim();
    if (!name) return;
    try {
      const res = await createTriviaPreset({
        name,
        questions: [emptyTriviaQuestion()],
      });
      setCreatingName("");
      setPresets((prev) => (prev ? [res.preset, ...prev] : [res.preset]));
      setOpenId(res.preset.id);
    } catch (e) {
      setError((e as Error).message ?? "Create failed");
    }
  }

  async function destroy(id: string) {
    const target = presets?.find((p) => p.id === id);
    if (!target) return;
    if (
      !confirm(
        `Delete preset “${target.name}”? Trivia rounds that already used it keep their copy of the questions.`,
      )
    ) {
      return;
    }
    try {
      await deleteTriviaPreset(id);
      setPresets((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
      if (openId === id) setOpenId(null);
    } catch (e) {
      setError((e as Error).message ?? "Delete failed");
    }
  }

  function applyEdit(id: string, patch: Partial<TriviaPreset>) {
    setPresets((prev) =>
      prev ? prev.map((p) => (p.id === id ? { ...p, ...patch } : p)) : prev,
    );
  }

  return (
    <section className="space-y-5">
      <div className="bg-bg-card rounded-xl2 p-5 space-y-3">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-display text-xl font-bold">📚 Trivia library</h2>
            <p className="text-xs opacity-60 mt-1">
              Reusable question sets you can drop into any trivia round.
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={creatingName}
            onChange={(e) => setCreatingName(e.target.value)}
            placeholder="New preset name (e.g. “Eli's bachelor trivia”)"
            className="flex-1 min-w-[220px] rounded-lg bg-bg-deep border border-white/10 px-3 py-2 outline-none focus:border-accent-pink"
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
          />
          <button
            type="button"
            onClick={create}
            disabled={!creatingName.trim()}
            className="px-4 py-2 rounded-lg bg-gradient-party font-display font-extrabold tracking-widest text-sm disabled:opacity-40"
          >
            ➕ new preset
          </button>
        </div>

        {error && <div className="text-xs text-accent-pink">{error}</div>}
      </div>

      {presets === null && (
        <div className="text-center opacity-60 py-6">Loading…</div>
      )}

      {presets && presets.length === 0 && (
        <div className="text-center text-sm opacity-60 py-6">
          No presets yet. Create one above ↑
        </div>
      )}

      <div className="space-y-3">
        {presets?.map((p) => (
          <PresetCard
            key={p.id}
            preset={p}
            open={openId === p.id}
            onOpen={() => setOpenId((cur) => (cur === p.id ? null : p.id))}
            onDelete={() => destroy(p.id)}
            onPatched={(patch) => applyEdit(p.id, patch)}
          />
        ))}
      </div>
    </section>
  );
}

function PresetCard({
  preset,
  open,
  onOpen,
  onDelete,
  onPatched,
}: {
  preset: TriviaPreset;
  open: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onPatched: (patch: Partial<TriviaPreset>) => void;
}) {
  const [name, setName] = useState(preset.name);
  const [questions, setQuestions] = useState<TriviaQuestion[]>(preset.questions);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset local edits when the preset prop changes (e.g. external reload).
  useEffect(() => {
    setName(preset.name);
    setQuestions(preset.questions);
  }, [preset.id, preset.updatedAt]);

  const dirty =
    name !== preset.name ||
    JSON.stringify(coerceTriviaQuestions(questions)) !==
      JSON.stringify(preset.questions);

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await updateTriviaPreset(preset.id, { name, questions });
      onPatched(res.preset);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    } catch (e) {
      setErr((e as Error).message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-bg-card rounded-xl2 border border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/5"
      >
        <span className="text-2xl">❓</span>
        <div className="flex-1 min-w-0">
          <div className="font-display font-extrabold truncate">{preset.name}</div>
          <div className="text-[11px] opacity-60">
            {preset.questions.length} question
            {preset.questions.length === 1 ? "" : "s"} · updated{" "}
            {new Date(preset.updatedAt).toLocaleString()}
          </div>
        </div>
        <span className="text-xs opacity-70">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-white/5 p-4 space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest opacity-60">
              Name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg bg-bg-deep border border-white/10 px-3 py-2 outline-none focus:border-accent-pink"
            />
          </label>

          <TriviaQuestionsEditor
            questions={questions}
            onChange={setQuestions}
          />

          {err && <div className="text-xs text-accent-pink">{err}</div>}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={onDelete}
              className="px-3 py-2 rounded-lg bg-bg-deep border border-accent-pink/40 text-accent-pink text-sm font-bold"
            >
              🗑 delete preset
            </button>
            <div className="flex items-center gap-2">
              {savedFlash && (
                <span className="text-xs text-accent-green">✅ saved</span>
              )}
              <button
                type="button"
                onClick={save}
                disabled={!dirty || saving}
                className="px-4 py-2 rounded-lg bg-gradient-party font-display font-extrabold tracking-widest text-sm disabled:opacity-40"
              >
                {saving ? "saving…" : "save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
