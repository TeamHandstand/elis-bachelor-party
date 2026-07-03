"use client";

// Host config for an OPEN event: pick which single-attempt games are included
// and tune each game's target/time. Reuses the PATCH /api/events/:code save path
// (patchEvent) and the event.rounds list — for open events each round is a game
// played once. Trivia additionally carries an authored question set.

import { useMemo, useState } from "react";
import { patchEvent } from "./_fetch";
import { TriviaRoundModal } from "./TriviaRoundModal";
import { CHALLENGES, OPEN_GAMES, type OpenGameSpec } from "@/lib/challenges";
import type { ChallengeId, EventConfig, RoundConfig, TriviaQuestion } from "@/lib/types";

export default function OpenGamesPanel({
  event,
  onSaved,
}: {
  event: EventConfig;
  onSaved: (e: EventConfig) => void;
}) {
  const allGames = useMemo(() => Object.values(OPEN_GAMES) as OpenGameSpec[], []);
  const thresholdById = useMemo(
    () => new Map(event.rounds.map((r) => [r.challenge, r.threshold] as const)),
    [event.rounds],
  );

  const [enabled, setEnabled] = useState<Set<ChallengeId>>(
    () =>
      new Set(
        event.rounds
          .map((r) => r.challenge)
          .filter((id) => id in OPEN_GAMES) as ChallengeId[],
      ),
  );
  // Per-game editable value in DISPLAY units (e.g. seconds), for games with config.
  const [values, setValues] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const g of allGames) {
      if (!g.config) continue;
      const stored = thresholdById.get(g.gameId) ?? g.durationMs;
      out[g.gameId] = Math.round(stored / g.config.scale);
    }
    return out;
  });
  const [triviaQuestions, setTriviaQuestions] = useState<TriviaQuestion[]>(
    () => event.rounds.find((r) => r.challenge === "trivia")?.questions ?? [],
  );
  const [editingTrivia, setEditingTrivia] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const triviaEnabledButEmpty =
    enabled.has("trivia") && triviaQuestions.length === 0;

  function toggle(id: ChallengeId) {
    setSaved(false);
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setValue(g: OpenGameSpec, raw: number) {
    if (!g.config) return;
    const v = Math.max(g.config.min, Math.min(g.config.max, raw));
    setSaved(false);
    setValues((prev) => ({ ...prev, [g.gameId]: v }));
  }

  async function save() {
    if (busy || enabled.size === 0 || triviaEnabledButEmpty) return;
    setBusy(true);
    setError(null);
    try {
      const rounds: RoundConfig[] = allGames
        .filter((g) => enabled.has(g.gameId))
        .map((g) => {
          if (g.gameId === "trivia") {
            return { challenge: "trivia", threshold: 0, questions: triviaQuestions };
          }
          if (g.config) {
            const disp = values[g.gameId] ?? Math.round(g.durationMs / g.config.scale);
            return { challenge: g.gameId, threshold: Math.round(disp * g.config.scale) };
          }
          return { challenge: g.gameId, threshold: thresholdById.get(g.gameId) ?? g.durationMs };
        });
      const { event: updated } = await patchEvent(event.code, { rounds });
      onSaved(updated);
      setTriviaQuestions(
        updated.rounds.find((r) => r.challenge === "trivia")?.questions ?? [],
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save games.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-bg-card rounded-xl2 p-4">
      <div className="font-display text-lg font-extrabold mb-1">Games</div>
      <p className="text-xs opacity-60 mb-4">
        Choose which games are in this open-play event and tune each one.
        Everyone plays each game once; each has its own leaderboard, and
        placements add up to the overall board.
      </p>

      <div className="space-y-2">
        {allGames.map((g) => {
          const meta = CHALLENGES[g.gameId];
          const on = enabled.has(g.gameId);
          const isTrivia = g.gameId === "trivia";
          const subtitle = isTrivia
            ? `${triviaQuestions.length} question${triviaQuestions.length === 1 ? "" : "s"}`
            : g.instruction;
          return (
            <div
              key={g.gameId}
              className={`w-full rounded-xl p-3 border transition-colors ${
                on
                  ? "bg-gradient-party border-transparent"
                  : "bg-bg-deep/40 border-white/10 hover:border-accent-orange/50"
              }`}
            >
              <div
                onClick={() => toggle(g.gameId)}
                className="flex items-center gap-3 cursor-pointer"
              >
                <div className="text-2xl">{meta.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{meta.label}</div>
                  <div className="text-xs opacity-70 truncate">{subtitle}</div>
                </div>
                {isTrivia && on ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingTrivia(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-bg-deep/70 border border-white/20 text-xs font-bold"
                  >
                    ✏️ questions
                  </button>
                ) : null}
                <div className="font-display font-extrabold text-lg">
                  {on ? "✓" : "+"}
                </div>
              </div>

              {on && g.config ? (
                <div
                  className="mt-3 flex items-center gap-2 pl-11"
                  onClick={(e) => e.stopPropagation()}
                >
                  <label className="text-xs font-bold opacity-90">{g.config.label}</label>
                  <input
                    type="number"
                    min={g.config.min}
                    max={g.config.max}
                    step={g.config.step}
                    value={values[g.gameId] ?? Math.round(g.durationMs / g.config.scale)}
                    onChange={(e) => setValue(g, Number(e.target.value))}
                    className="w-20 rounded-lg bg-bg-deep border border-white/20 px-2 py-1.5 text-sm font-bold outline-none focus:border-white/50"
                  />
                  <span className="text-xs opacity-70">{g.config.unit}</span>
                  <span className="text-[10px] opacity-50">
                    ({g.config.min}–{g.config.max})
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {triviaEnabledButEmpty ? (
        <p className="text-xs text-accent-pink mt-3">
          Trivia is on but has no questions — tap “✏️ questions” to add some
          before saving.
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={busy || enabled.size === 0 || triviaEnabledButEmpty}
          className="rounded-xl px-5 py-2.5 bg-gradient-party font-bold disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save games"}
        </button>
        {enabled.size === 0 ? (
          <span className="text-xs text-accent-pink">Pick at least one game.</span>
        ) : null}
        {saved ? <span className="text-xs text-accent-green">Saved ✓</span> : null}
      </div>
      {error ? <p className="text-sm text-accent-pink mt-2">{error}</p> : null}

      {editingTrivia ? (
        <TriviaRoundModal
          ordinal={1}
          initialQuestions={triviaQuestions}
          onClose={() => setEditingTrivia(false)}
          onSave={(qs) => {
            setTriviaQuestions(qs);
            setSaved(false);
          }}
        />
      ) : null}
    </div>
  );
}
