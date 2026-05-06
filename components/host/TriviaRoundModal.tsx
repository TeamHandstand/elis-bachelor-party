"use client";

import { useEffect, useState } from "react";
import {
  createTriviaPreset,
  listTriviaPresets,
} from "./_fetch";
import type { TriviaPreset, TriviaQuestion } from "@/lib/types";
import { sanitizeTriviaQuestionsForSave } from "@/lib/challenges";
import { TriviaQuestionsEditor } from "./TriviaQuestionsEditor";

interface Props {
  ordinal: number;
  initialQuestions: TriviaQuestion[];
  onClose: () => void;
  onSave: (questions: TriviaQuestion[]) => void;
}

/**
 * Modal overlay for editing the question list of a single trivia round.
 * Lets the host:
 *  - edit questions inline
 *  - apply an existing preset (replaces current draft)
 *  - save the current draft as a new preset
 *
 * Edits are buffered in local state — the parent only sees them when the
 * host clicks Save (so reorders / abandoned edits don't trigger saves).
 */
export function TriviaRoundModal({
  ordinal,
  initialQuestions,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<TriviaQuestion[]>(initialQuestions);
  const [presets, setPresets] = useState<TriviaPreset[] | null>(null);
  const [presetsErr, setPresetsErr] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listTriviaPresets()
      .then((res) => {
        if (!cancelled) setPresets(res.presets);
      })
      .catch((e) => {
        if (!cancelled) setPresetsErr(e?.message ?? "Failed to load presets");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function applyPreset(p: TriviaPreset) {
    if (
      draft.length > 0 &&
      !confirm(
        `Replace the current ${draft.length} question${
          draft.length === 1 ? "" : "s"
        } with the “${p.name}” preset?`,
      )
    ) {
      return;
    }
    // Clone so editing the round won't mutate the preset's array reference.
    setDraft(p.questions.map((q) => ({ ...q, choices: [...q.choices] })));
    setShowPresets(false);
  }

  async function saveAsPreset() {
    const name = saveAsName.trim();
    if (!name || saving) return;
    const { clean, droppedCount } = sanitizeTriviaQuestionsForSave(draft);
    if (clean.length === 0) {
      alert("Add at least one question with a prompt and two choices first.");
      return;
    }
    if (
      droppedCount > 0 &&
      !confirm(
        `${droppedCount} incomplete question${
          droppedCount === 1 ? "" : "s"
        } will be skipped (need a prompt and at least two non-blank choices). Save anyway?`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const res = await createTriviaPreset({ name, questions: clean });
      setPresets((prev) => (prev ? [res.preset, ...prev] : [res.preset]));
      setSaveAsName("");
    } catch (e) {
      alert((e as Error).message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function commit() {
    const { clean, droppedCount } = sanitizeTriviaQuestionsForSave(draft);
    if (
      droppedCount > 0 &&
      !confirm(
        `${droppedCount} incomplete question${
          droppedCount === 1 ? "" : "s"
        } will be dropped (need a prompt and at least two non-blank choices). Save anyway?`,
      )
    ) {
      return;
    }
    onSave(clean);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-bg rounded-none sm:rounded-2xl border border-white/10 w-full max-w-3xl max-h-screen sm:max-h-[90vh] flex flex-col">
        <header className="flex items-center justify-between gap-3 p-4 border-b border-white/10">
          <div>
            <div className="text-[10px] uppercase tracking-widest opacity-60">
              round {ordinal} · ❓ trivia
            </div>
            <h2 className="font-display text-xl font-extrabold">
              Edit questions
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg bg-bg-card border border-white/15 text-sm font-bold"
          >
            ✕ close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Apply preset */}
          <div className="rounded-xl bg-bg-card border border-white/10 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs uppercase tracking-widest opacity-70 font-bold">
                📚 apply a saved preset
              </div>
              <button
                type="button"
                onClick={() => setShowPresets((v) => !v)}
                className="text-xs px-3 py-1.5 rounded-lg bg-bg-deep border border-white/10 font-bold"
              >
                {showPresets ? "hide" : "browse"} (
                {presets ? presets.length : "…"})
              </button>
            </div>
            {showPresets && (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {presetsErr && (
                  <div className="text-xs text-accent-pink">{presetsErr}</div>
                )}
                {presets && presets.length === 0 && (
                  <div className="text-xs opacity-60">
                    No presets yet. Save the current questions below to start
                    a library.
                  </div>
                )}
                {presets?.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="w-full text-left rounded-lg bg-bg-deep border border-white/10 hover:border-accent-orange p-2 px-3"
                  >
                    <div className="font-bold truncate">{p.name}</div>
                    <div className="text-[11px] opacity-60">
                      {p.questions.length} question
                      {p.questions.length === 1 ? "" : "s"} · updated{" "}
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Inline question editor */}
          <TriviaQuestionsEditor questions={draft} onChange={setDraft} />

          {/* Save as preset */}
          {draft.length > 0 && (
            <div className="rounded-xl bg-bg-card border border-white/10 p-3 flex items-center gap-2 flex-wrap">
              <div className="text-xs uppercase tracking-widest opacity-70 font-bold w-full sm:w-auto">
                💾 save as preset
              </div>
              <input
                type="text"
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
                placeholder="Name (e.g. “Eli's life trivia”)"
                className="flex-1 min-w-[180px] rounded-lg bg-bg-deep border border-white/10 px-3 py-2 outline-none focus:border-accent-pink text-sm"
              />
              <button
                type="button"
                disabled={!saveAsName.trim() || saving}
                onClick={saveAsPreset}
                className="px-4 py-2 rounded-lg bg-bg-deep border border-accent-green/40 text-accent-green font-bold text-sm disabled:opacity-50"
              >
                {saving ? "saving…" : "save preset"}
              </button>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 p-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 rounded-xl bg-bg-card border border-white/15 font-bold"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={commit}
            className="px-5 py-3 rounded-xl bg-gradient-party font-display font-extrabold tracking-widest"
          >
            ✓ save
          </button>
        </footer>
      </div>
    </div>
  );
}
