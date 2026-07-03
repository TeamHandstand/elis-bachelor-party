"use client";

// Open Play trivia: answer the round's question set once. Score = correct count
// (higher is better). Answers are graded client-side (same trust model as the
// heptathlon trivia view — the question set with correctIndex is already public
// in the event config).

import { useMemo, useState } from "react";
import { scoreTriviaAnswers } from "@/lib/challenges";
import type { TriviaQuestion } from "@/lib/types";

type Phase = "answering" | "done";

export default function TriviaAttempt({
  questions,
  onSubmit,
}: {
  questions: TriviaQuestion[];
  onSubmit: (score: number, meta?: Record<string, unknown>) => Promise<void> | void;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<Phase>("answering");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const correct = useMemo(
    () => scoreTriviaAnswers(questions, answers),
    [questions, answers],
  );
  const answeredCount = questions.filter((q) => q.id in answers).length;

  if (questions.length === 0) {
    return (
      <div className="rounded-2xl bg-bg-card p-8 text-center">
        <div className="text-4xl mb-3">🤷</div>
        <div className="font-display font-extrabold mb-1">No questions yet</div>
        <div className="text-xs opacity-70">
          The host hasn’t added trivia questions for this event.
        </div>
      </div>
    );
  }

  function pick(qId: string, cIdx: number) {
    if (phase !== "answering") return;
    setAnswers((prev) => {
      const next = { ...prev };
      if (next[qId] === cIdx) delete next[qId];
      else next[qId] = cIdx;
      return next;
    });
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(correct, { total: questions.length });
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t submit.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-28">
      <div className="rounded-2xl bg-bg-card border border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="text-xs opacity-70 font-bold">
          {phase === "done" ? "your answers are locked in" : "answer them all, then submit"}
        </div>
        <div className="text-right tabular-nums">
          <div className="font-display text-2xl font-extrabold leading-none">
            {phase === "done" ? correct : answeredCount}
          </div>
          <div className="text-[10px] uppercase tracking-widest opacity-60">
            {phase === "done" ? "correct" : `/ ${questions.length}`}
          </div>
        </div>
      </div>

      {questions.map((q, qIdx) => {
        const picked = answers[q.id];
        return (
          <div key={q.id} className="rounded-2xl bg-bg-card border border-white/10 p-4">
            <div className="flex items-baseline gap-2 mb-3">
              <div className="font-display font-extrabold text-accent-orange tabular-nums w-6">
                {qIdx + 1}.
              </div>
              <div className="font-bold leading-snug flex-1">{q.prompt}</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {q.choices.map((choice, cIdx) => {
                const isPicked = picked === cIdx;
                const isCorrect = q.correctIndex === cIdx;
                let cls =
                  "px-3 py-2 rounded-xl text-left text-sm font-bold border transition-colors ";
                if (phase === "done") {
                  if (isCorrect) cls += "bg-accent-green/30 border-accent-green text-white";
                  else if (isPicked) cls += "bg-accent-pink/20 border-accent-pink/60";
                  else cls += "bg-bg-deep border-white/10 opacity-70";
                } else {
                  cls += isPicked
                    ? "bg-gradient-party border-transparent text-white"
                    : "bg-bg-deep border-white/10 hover:border-accent-orange/50";
                }
                return (
                  <button
                    key={cIdx}
                    type="button"
                    onClick={() => pick(q.id, cIdx)}
                    disabled={phase === "done"}
                    className={cls}
                  >
                    <span className="opacity-60 mr-2 tabular-nums">
                      {String.fromCharCode(65 + cIdx)}.
                    </span>
                    {choice}
                    {phase === "done" && isCorrect ? (
                      <span className="ml-2 text-[10px] uppercase tracking-widest opacity-90">
                        ✅
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {phase === "answering" && (
        <div className="fixed bottom-0 left-0 right-0 bg-bg-deep/95 backdrop-blur border-t border-white/10 p-4 flex flex-col items-center gap-2 z-20">
          {answeredCount < questions.length && (
            <div className="text-[10px] uppercase tracking-widest text-accent-pink">
              {questions.length - answeredCount} unanswered — those count as wrong
            </div>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full max-w-md py-4 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest disabled:opacity-50"
          >
            {submitting ? "SAVING…" : "SUBMIT 🔒"}
          </button>
          <div className="text-[10px] opacity-60">one shot — locks in your answers</div>
        </div>
      )}

      {error && <div className="text-accent-pink text-sm text-center">{error}</div>}
    </div>
  );
}
